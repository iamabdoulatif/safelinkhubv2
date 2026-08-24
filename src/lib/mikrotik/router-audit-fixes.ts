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
