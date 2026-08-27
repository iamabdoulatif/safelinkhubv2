import type { RouterOSClient } from "./client";

/**
 * Correctifs d'audit à ÉCRITURE (par opposition aux constats lecture-seule de
 * router-audit.ts) : complétion des policies du groupe API et mise à niveau du
 * firmware RouterBOARD. Isolés ici pour que la DÉTECTION (router-audit.ts) et
 * les CORRECTIFS (server actions) partagent exactement les mêmes constantes.
 */

// ── Groupe API : policies requises par MikHmon ──────────────────────────────

/** Nom du groupe du compte de service API créé par install-vpn.rsc. */
export const API_GROUP_NAME = "safelinkhub-group";

/**
 * Policies dont le groupe API a besoin. `policy` est la permission
 * historiquement manquante (routeurs provisionnés avant correctif) : sans elle,
 * le MikHmon hébergé — qui se connecte AVEC ce compte — ne peut pas écrire les
 * scripts `on-login`/`on-logout` des profils, les schedulers d'expiration des
 * tickets, ni les scripts de journal de revenu (`/system script`, comment=
 * mikhmon) qu'il relit pour calculer les recettes. D'où « tickets qui
 * n'expirent pas » + « revenu absent ». `ftp` reste requis pour l'upload du
 * portail captif. On garde le principe de moindre privilège : rien de plus.
 */
export const REQUIRED_API_GROUP_POLICIES = [
  "api",
  "read",
  "write",
  "policy",
  "test",
  "sensitive",
  "ssh",
  "ftp",
] as const;

/**
 * Policies MANQUANTES dans un champ `policy=` RouterOS (ex.
 * "ssh,ftp,read,write,test,sensitive,api,!policy,…"). Ne compte que les
 * permissions ACTIVES (on ignore celles préfixées de `!`).
 */
export function missingApiGroupPolicies(policyField: string | undefined | null): string[] {
  const present = new Set(
    (policyField ?? "")
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p.length > 0 && !p.startsWith("!")),
  );
  return REQUIRED_API_GROUP_POLICIES.filter((p) => !present.has(p));
}

export type ApiGroupPolicyResult = {
  /** Le groupe safelinkhub-group existe-t-il ? */
  found: boolean;
  /** Permissions qui manquaient avant correction (vide si déjà conforme). */
  missing: string[];
  /** Un `set` a-t-il été appliqué ? (false = déjà conforme ou introuvable) */
  applied: boolean;
};

/**
 * Complète les policies du groupe API si `policy` (ou toute autre requise)
 * manque. Idempotent : no-op si déjà conforme. LECTURE d'abord pour ne réécrire
 * que si nécessaire et pour renvoyer un résumé exact.
 */
export async function ensureApiGroupPolicy(
  client: RouterOSClient,
  timeoutMs = 15000,
): Promise<ApiGroupPolicyResult> {
  const groups = await client
    .talk(["/user/group/print", `?name=${API_GROUP_NAME}`], timeoutMs)
    .catch(() => []);
  const group = groups[0];
  if (!group) return { found: false, missing: [], applied: false };

  const missing = missingApiGroupPolicies(group.policy);
  if (missing.length === 0) return { found: true, missing: [], applied: false };

  await client.talk(
    [
      "/user/group/set",
      `=numbers=${group[".id"]}`,
      `=policy=${REQUIRED_API_GROUP_POLICIES.join(",")}`,
    ],
    timeoutMs,
  );
  return { found: true, missing, applied: true };
}

// ── Firmware RouterBOARD ────────────────────────────────────────────────────

export type RouterboardFirmware = {
  routerboard: boolean;
  current: string;
  /** Version que le RouterOS installé embarque pour le RouterBOARD. */
  target: string;
  /** current ≠ target ET c'est bien un RouterBOARD → mise à niveau en attente. */
  pending: boolean;
};

/** Lecture seule de l'état du firmware RouterBOARD. */
export async function readRouterboardFirmware(
  client: RouterOSClient,
  timeoutMs = 15000,
): Promise<RouterboardFirmware> {
  const [rb] = await client.talk(["/system/routerboard/print"], timeoutMs).catch(() => []);
  const routerboard = rb?.routerboard === "true";
  const current = rb?.["current-firmware"] ?? "?";
  const target = rb?.["upgrade-firmware"] ?? "?";
  const pending = routerboard && current !== "?" && target !== "?" && current !== target;
  return { routerboard, current, target, pending };
}

export type RouterboardUpgradeResult = RouterboardFirmware & { applied: boolean };

/**
 * Stage le firmware RouterBOARD embarqué par le RouterOS courant. La commande
 * ÉCRIT le nouveau firmware mais ne redémarre PAS : il s'applique au prochain
 * reboot (à planifier hors-pointe). Idempotent : no-op si déjà à jour ou si ce
 * n'est pas un RouterBOARD (ex. CHR).
 */
export async function upgradeRouterboardFirmware(
  client: RouterOSClient,
  timeoutMs = 15000,
): Promise<RouterboardUpgradeResult> {
  const state = await readRouterboardFirmware(client, timeoutMs);
  if (!state.pending) return { ...state, applied: false };
  await client.talk(["/system/routerboard/upgrade"], timeoutMs);
  return { ...state, applied: true };
}

// ── Tickets épinglés à une adresse MAC ──────────────────────────────────────

export type MacBoundTicketsResult = {
  /** Tickets portant une `mac-address` avant correction. */
  found: number;
  /** Tickets réellement déliés. */
  unbound: number;
  /** Comptes de roaming (nom = MAC) volontairement ÉPARGNÉS. */
  skippedRoaming: number;
  /** Échantillon d'adresses corrigées, pour le message d'interface. */
  sample: string[];
};

/**
 * Un MAC est-il « localement administré », c'est-à-dire une adresse PRIVÉE
 * ALÉATOIRE générée par le téléphone plutôt que gravée par le fabricant ?
 *
 * C'est le deuxième bit de poids faible du premier octet. Ce sont ces adresses
 * qui tournent, et donc celles qui cassent un ticket épinglé.
 */
export function isRandomizedMac(mac: string): boolean {
  const first = Number.parseInt(mac.trim().slice(0, 2), 16);
  return Number.isFinite(first) && (first & 0b10) !== 0;
}

/**
 * Délie les tickets hotspot épinglés à une adresse MAC.
 *
 * POURQUOI : la livraison du portail créait le compte avec `=mac-address=` (le
 * MAC vu à l'achat), pour empêcher le partage du code. Mais les téléphones
 * changent de MAC privée régulièrement — le client revient quelques heures plus
 * tard avec une autre adresse et RouterOS refuse son code. L'anti-partage est
 * assuré autrement, par `shared-users=1` du profil.
 *
 * ÉPARGNE LES COMPTES DE ROAMING : la propagation MAC (lib/roaming) crée
 * volontairement des comptes dont le NOM EST le MAC, pour l'auto-connexion
 * inter-zones. Les délier casserait cette fonctionnalité. On ne touche donc
 * qu'aux comptes dont le nom diffère de l'adresse.
 *
 * Idempotent : relancer sur un routeur déjà corrigé ne trouve rien.
 */
export async function unbindMacBoundTickets(
  client: RouterOSClient,
  timeoutMs = 20000,
): Promise<MacBoundTicketsResult> {
  const users = await client
    .talk(["/ip/hotspot/user/print", "=.proplist=.id,name,mac-address"], timeoutMs)
    .catch(() => [] as Record<string, string>[]);

  const normalize = (value: string | undefined) => (value ?? "").trim().toUpperCase();
  const bound = users.filter((user) => {
    const mac = normalize(user["mac-address"]);
    return mac !== "" && mac !== "00:00:00:00:00:00";
  });
  const roaming = bound.filter((user) => normalize(user.name) === normalize(user["mac-address"]));
  const target = bound.filter((user) => normalize(user.name) !== normalize(user["mac-address"]));

  const sample: string[] = [];
  let unbound = 0;
  for (const user of target) {
    const id = user[".id"];
    if (!id) continue;
    try {
      // Valeur vide = champ effacé côté RouterOS.
      await client.talk(["/ip/hotspot/user/set", `=numbers=${id}`, "=mac-address="], timeoutMs);
      unbound += 1;
      if (sample.length < 5) sample.push(`${user.name} (${normalize(user["mac-address"])})`);
    } catch {
      // Un échec isolé ne doit pas arrêter le balayage du routeur.
    }
  }

  return { found: target.length, unbound, skippedRoaming: roaming.length, sample };
}

// ── Format des dates d'expiration ────────────────────────────────────────
import { inspectExpiryFormats } from "./ticket-expiry-format";

export type ExpiryFormatFixResult = {
  /** Tickets trouvés au format ISO. */
  found: number;
  /** Tickets effectivement réécrits. */
  rewritten: number;
  /** Échecs d'écriture (routeur qui refuse, ligne disparue entre-temps). */
  failed: number;
};

/**
 * Réécrit au format MikHmon les expirations rendues en ISO par RouterOS 7.24.
 *
 * Voir ticket-expiry-format.ts pour le pourquoi. Ne SUPPRIME rien : on rend
 * seulement les tickets lisibles par le balayage déjà installé, qui décidera
 * lui-même quoi retirer au passage suivant. Un correctif qui supprimerait des
 * comptes directement contournerait les règles du routeur.
 */
export async function rewriteIsoExpiryComments(
  client: RouterOSClient,
  timeoutMs = 30000,
): Promise<ExpiryFormatFixResult> {
  const users = await client
    .talk(["/ip/hotspot/user/print", "=.proplist=.id,name,comment"], timeoutMs)
    .catch(() => [] as Record<string, string>[]);
  const { isoCount, aReecrire } = inspectExpiryFormats(users);

  let rewritten = 0;
  let failed = 0;
  for (const ligne of aReecrire) {
    try {
      await client.talk(
        ["/ip/hotspot/user/set", `=.id=${ligne.id}`, `=comment=${ligne.to}`],
        timeoutMs,
      );
      rewritten++;
    } catch {
      failed++;
    }
  }
  return { found: isoCount, rewritten, failed };
}

// ── Balayage aveugle à l'horloge ISO ─────────────────────────────────────
import { inspectProfileOnLogin, inspectSweepSchedulers } from "./expiry-sweep-script";

export type SweepRepairResult = {
  /** Balayages trouvés sur le routeur. */
  total: number;
  /** Balayages périmés (aveugles à l'horloge ISO). */
  stale: number;
  /** Réécrits avec succès. */
  repaired: number;
  failed: number;
  /** Profils réparés, pour le compte rendu. */
  profiles: string[];
  /** Scripts `on-login` complétés — la SOURCE des dates illisibles. */
  onLoginRepaired: number;
};

/**
 * Réécrit les scripts de balayage qui ne savent pas lire l'horloge ISO de
 * RouterOS 7.24 (voir expiry-sweep-script.ts).
 *
 * POURQUOI ON RECRÉE AU LIEU DE MODIFIER. La première version faisait un
 * `/system/scheduler/set` — et RouterOS l'a refusé sur les huit
 * planificateurs de HTSPT-TREW :
 *
 *     user's policy does not allow to edit this script
 *
 * Ces lignes appartiennent à `admin` et portent une politique large
 * (reboot, password, sniff, romon). Pour ÉDITER un script, il faut posséder
 * toutes ses politiques ; le compte API ne les a pas — et il ne DOIT pas les
 * avoir, ce serait lui donner le mot de passe et la capture de trafic pour
 * réparer une tâche planifiée.
 *
 * En revanche il a le droit de SUPPRIMER la ligne et d'en poser une neuve,
 * qui hérite de sa propre politique : `ftp,read,write,policy,test,sensitive`.
 * Le balayage n'a besoin que de `write` pour retirer un utilisateur hotspot —
 * la politique étroite suffit, et c'est même préférable.
 *
 * Le nom et l'intervalle d'origine sont repris à l'identique.
 */
export async function repairExpirySweeps(
  client: RouterOSClient,
  timeoutMs = 30000,
): Promise<SweepRepairResult> {
  const schedulers = await client
    .talk(["/system/scheduler/print"], timeoutMs)
    .catch(() => [] as Record<string, string>[]);
  const { total, stale } = inspectSweepSchedulers(schedulers as Record<string, string>[]);

  let repaired = 0;
  let failed = 0;
  const profiles: string[] = [];
  for (const s of stale) {
    try {
      /* Suppression PUIS création : deux noms identiques ne cohabitent pas.
         Si la création échouait après la suppression, le profil se
         retrouverait sans balayage — mais l'ancien ne supprimait déjà rien,
         donc il n'y a rien à perdre. L'échec est compté et rapporté. */
      await client.talk(["/system/scheduler/remove", `=.id=${s.id}`], timeoutMs);
      await client.talk(
        [
          "/system/scheduler/add",
          `=name=${s.name}`,
          `=interval=${s.interval}`,
          `=on-event=${s.script}`,
          `=comment=Monitor Profile ${s.profile}`,
        ],
        timeoutMs,
      );
      repaired++;
      profiles.push(s.profile);
    } catch {
      failed++;
    }
  }
  /* Le `on-login` du profil est l'autre moitié : il ÉCRIT la date à la
     première connexion. Réparer le balayage sans lui, c'est vider une
     baignoire robinet ouvert. */
  const profils = await client
    .talk(["/ip/hotspot/user/profile/print", "=.proplist=.id,name,on-login"], timeoutMs)
    .catch(() => [] as Record<string, string>[]);
  let onLoginRepaired = 0;
  for (const prof of inspectProfileOnLogin(profils as Record<string, string>[]).stale) {
    try {
      await client.talk(
        ["/ip/hotspot/user/profile/set", `=.id=${prof.id}`, `=on-login=${prof.script}`],
        timeoutMs,
      );
      onLoginRepaired++;
    } catch {
      failed++;
    }
  }

  return { total, stale: stale.length, repaired, failed, profiles, onLoginRepaired };
}

// ── Services superflus ──────────────────────────────────────────────────────

/**
 * Services que SafeLinkHub éteint d'office, et POURQUOI.
 *
 * Le tri suit une règle simple : on ne coupe que ce dont ni SafeLinkHub, ni le
 * hotspot, ni l'exploitant n'ont besoin — et dont la présence coûte quelque
 * chose. Tout le reste est SIGNALÉ, jamais touché : couper un service dont un
 * routeur du parc dépendrait casserait trente-cinq installations pour en
 * durcir une.
 *
 * Ce qu'on NE coupe pas, et la raison :
 *   api      — l'unique canal par lequel SafeLinkHub pilote le routeur ;
 *   winbox   — l'outil de l'exploitant, et son dernier recours si l'API tombe ;
 *   ftp      — `/export file=` et `/system backup save` en dépendent ;
 *   www      — console d'administration, parfois le seul accès d'un technicien ;
 *   ssh      — canal de secours du relais.
 */
export const SUPERFLUOUS_SERVICES = [
  {
    id: "telnet",
    label: "Telnet",
    path: "/ip/service",
    reason: "Session d'administration en clair — mot de passe lisible sur le réseau.",
  },
  {
    id: "pptp",
    label: "Serveur PPTP",
    path: "/interface/pptp-server/server",
    reason:
      "VPN au chiffrement cassé depuis 2012, et inutilisé ici : le routeur rejoint SafeLinkHub par WireGuard.",
  },
  {
    id: "bandwidth-test",
    label: "Test de débit",
    path: "/tool/bandwidth-server",
    reason:
      "Permet à quiconque possède un compte de saturer la liaison — MikroTik conseille de le laisser éteint.",
  },
] as const;

export type SuperfluousServiceId = (typeof SUPERFLUOUS_SERVICES)[number]["id"];

/** Services signalés mais JAMAIS coupés automatiquement — voir le bloc ci-dessus. */
export const REPORTED_ONLY_SERVICES = ["ftp", "www", "www-ssl", "ssh"] as const;

/**
 * Ce qui reste à éteindre, d'après l'état lu sur le routeur.
 *
 * `enabled` porte l'état de chaque service, `undefined` quand la lecture n'a
 * rien renvoyé : un service qu'on n'a pas su lire n'est pas déclaré actif —
 * sinon le correctif tenterait d'éteindre ce qui l'est déjà, et le rapport
 * annoncerait un durcissement qui n'a pas eu lieu.
 */
export function superfluousServicesToDisable(
  enabled: Partial<Record<SuperfluousServiceId, boolean | undefined>>,
): typeof SUPERFLUOUS_SERVICES[number][] {
  return SUPERFLUOUS_SERVICES.filter((s) => enabled[s.id] === true);
}
