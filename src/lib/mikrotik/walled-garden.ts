// Walled-garden du hotspot : hôtes qu'un client NON authentifié peut atteindre
// depuis la page de login (portail captif). Centralisé ici pour que le bootstrap
// (script RouterOS) et l'assignation d'un modèle (API RouterOS) déploient
// EXACTEMENT le même ensemble — plus de dérive entre les deux chemins.
//
// Objectif : rendre le paiement en ligne joignable. GeniusPay héberge le
// checkout ; on autorise aussi Wave (rail mobile-money dominant en CI, souvent
// atteint en redirection depuis le checkout). Ajoutez ici tout autre domaine de
// rail nécessaire (les paiements USSD ne passent pas par le web et n'en ont pas
// besoin).

import type { RouterOSClient } from "./client";

export const WALLED_GARDEN_COMMENT = "safelinkhub-walled-garden";

// Catalogue des hôtes de paiement autorisés (hors app SafeLinkHub), groupés par
// rail. Ce catalogue alimente l'écran « Walled-garden » (Paramètres) où l'admin
// coche/décoche chaque hôte à installer. L'app SafeLinkHub, elle, est TOUJOURS
// déployée (jamais listée ici, donc jamais désactivable). On liste les hôtes
// vers lesquels le checkout redirige le navigateur du client.
// NON listé : cartes (Visa/Mastercard) — 3-D Secure redirige vers l'ACS de la
// banque émettrice (domaine arbitraire), non whitelistable derrière un portail
// captif. MTN MoMo direct reste surtout USSD/OTP (validation sur le téléphone,
// sans page web) ; le groupe MTN ci-dessous ne sert que si une page MoMoPay web
// est présentée, ou quand MTN est encaissé via un agrégateur (déjà couvert).
export type WalledGardenGroup = {
  /** Libellé du rail affiché dans l'écran de sélection. */
  group: string;
  /** Aide contextuelle (une phrase) affichée sous le titre du groupe. */
  description: string;
  hosts: string[];
};

export const WALLED_GARDEN_CATALOG: WalledGardenGroup[] = [
  {
    group: "GeniusPay (checkout)",
    description:
      "API sur pay.genius.ci, checkout servi sur geniuspay.ci — les deux domaines sont requis pour que la page de paiement s'ouvre.",
    hosts: ["pay.genius.ci", "*.genius.ci", "geniuspay.ci", "*.geniuspay.ci"],
  },
  {
    group: "Assets du checkout (CDN & polices)",
    description:
      "CSS Tailwind, libs JS et polices chargés par la page GeniusPay. Sans eux, le checkout s'affiche cassé.",
    hosts: ["cdn.tailwindcss.com", "cdn.jsdelivr.net", "fonts.googleapis.com", "fonts.gstatic.com"],
  },
  {
    group: "Paystack (agrégateur)",
    description:
      "GeniusPay délègue l'encaissement à Paystack (Wave, MTN, Moov, carte). Sans ces domaines, seul Orange Money passe. NB : le 3-D Secure carte peut rediriger hors whitelist.",
    hosts: ["paystack.com", "*.paystack.com", "paystack.co", "*.paystack.co", "checkout.paystack.com"],
  },
  {
    group: "CinetPay (agrégateur)",
    description:
      "Agrégateur CI (Orange, MTN, Moov, Wave, carte). Le client est redirigé vers checkout.cinetpay.com ; l'init passe par api-checkout.cinetpay.com.",
    hosts: ["cinetpay.com", "*.cinetpay.com"],
  },
  {
    group: "PawaPay (agrégateur)",
    description:
      "Agrégateur mobile money. Page hébergée où le client paie : paywith.pawapay.io (API sur api.pawapay.io).",
    hosts: ["pawapay.io", "*.pawapay.io"],
  },
  {
    group: "Wave",
    description: "Redirection directe vers wave.com depuis le checkout.",
    hosts: ["wave.com", "*.wave.com"],
  },
  {
    group: "Orange Money",
    description: "Orange Money Web Payment (+ variantes CI *.orange.ci).",
    hosts: ["webpayment.orange-money.com", "*.orange-money.com", "*.orange.ci"],
  },
  {
    group: "Moov Money (Moov Africa)",
    description: "Page de validation web Moov Africa (.ci / .com selon le pays).",
    hosts: ["moov-africa.ci", "*.moov-africa.ci", "*.moov-africa.com"],
  },
  {
    group: "MTN MoMo",
    description:
      "MoMo se valide surtout par USSD (approbation sur le téléphone, sans redirection navigateur) — souvent déjà couvert par un agrégateur ci-dessus. Ces hôtes ne sont utiles que si une page web MoMoPay est présentée au client.",
    hosts: ["momo.mtn.com", "*.mtn.com", "*.mtn.ci"],
  },
  // NB : PAS de Wassoya ici. Wassoya est la passerelle SMS appelée CÔTÉ SERVEUR
  // (safelinkhub.io → api.wassoya.com) pour envoyer les codes ; le navigateur du
  // client ne joint jamais Wassoya → aucun hôte à whitelister au portail.
];

// Liste plate dédoublonnée des hôtes de paiement, dérivée du catalogue —
// l'ensemble complet potentiellement installable (avant filtrage par org).
export const PAYMENT_WALLED_GARDEN_HOSTS: string[] = [
  ...new Set(WALLED_GARDEN_CATALOG.flatMap((g) => g.hosts)),
];

// ⚠️ NE PAS whitelister les hôtes de DÉTECTION de portail captif d'Apple
// (captive.apple.com, www.apple.com, www.appleiphonecell.com, www.itools.info,
// www.ibook.info, www.airport.us, www.thinkdifferent.us).
//
// Pourquoi : la sonde iOS interroge http://captive.apple.com/hotspot-detect.html
// dès la connexion Wi-Fi. Si elle est INTERCEPTÉE par le hotspot (redirigée vers
// la page de login), iOS ouvre AUTOMATIQUEMENT son mini-navigateur (CNA) → le
// portail « jaillit » tout seul sur l'iPhone. Si au contraire on autorise ces
// hôtes, la sonde atteint Apple, reçoit sa vraie page « Success », iOS croit le
// réseau EN LIGNE et n'ouvre RIEN. C'est le comportement voulu : auto-pop.
//
// Le mini-navigateur CNA gère mal le checkout Paystack / 3-D Secure, MAIS le
// portail ouvre désormais le checkout dans un NOUVEL onglet (échappe au CNA vers
// le vrai Safari) — donc plus besoin du contournement « whitelister Apple » qui
// supprimait le pop-up. On récupère les deux : portail auto-affiché + paiement.
//
// (Android connectivitycheck.gstatic.com / Windows msftconnecttest.com ne sont
// pas non plus whitelistés — même logique : là le portail s'ouvre déjà seul.)

/**
 * Ensemble complet du walled-garden pour une install : app + hôtes de paiement
 * NON désactivés par l'org. `disabledHosts` = hôtes explicitement décochés dans
 * Paramètres → Walled-garden. L'app SafeLinkHub reste TOUJOURS incluse (elle
 * n'est jamais dans le catalogue, donc jamais filtrable).
 */
// Domaine public canonique du SaaS — dernier recours quand l'environnement qui
// réconcilie fournit un hôte NON JOIGNABLE depuis un routeur. Cas réel : un dev
// server (NEXT_PUBLIC_APP_URL=http://0.0.0.0:3000) branché sur la vraie base a
// installé dst-host="0.0.0.0:3000" + "*.0.0.0.0:3000" sur un routeur de prod →
// safelinkhub.io jamais autorisé → paiement du portail bloqué (« Connexion au
// serveur impossible »). On préfère installer le domaine canonique plutôt
// qu'une entrée poubelle.
const CANONICAL_APP_HOST = "safelinkhub.io";

/** Hôte app nettoyé : port retiré (dst-host = nom seul), et repli sur le
 * domaine canonique si l'hôte est local/dev (0.0.0.0, localhost, 127.x, ::1). */
function sanitizeAppHost(appHost: string): string {
  const host = appHost
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "") // IPv6 entre crochets
    .replace(/:\d+$/, ""); // dst-host ne porte jamais de port
  if (
    !host ||
    host === "localhost" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host.startsWith("127.")
  ) {
    return CANONICAL_APP_HOST;
  }
  return host;
}

/**
 * Un `dst-host` de walled-garden est une EXPRESSION RÉGULIÈRE côté RouterOS,
 * pas un joker de shell. « *.genius.ci » n'en est donc pas une valide — le `*`
 * n'a rien à répéter — et RouterOS REFUSE l'entrée.
 *
 * Constaté sur YAHYA WIFI : après plusieurs réinstallations, le diagnostic
 * listait comme manquants EXACTEMENT les quatorze hôtes en « *. », et aucun
 * autre. Les ajouts échouaient un par un depuis toujours, silencieusement
 * (chaque `add` était enveloppé d'un `catch` muet), et l'exploitant recliquait
 * sans fin sur un correctif qui ne pouvait pas aboutir.
 *
 * On émet donc la forme régulière : « .*\.genius\.ci ». Les points du domaine
 * sont échappés — sans quoi « . » accepterait n'importe quel caractère, et
 * « genius-ci » passerait pour « genius.ci ».
 */
export function dstHostPattern(host: string): string {
  if (!host.startsWith("*.")) return host;
  return `.*\\.${host.slice(2).replace(/\./g, "\\.")}`;
}

/**
 * Le même motif, tel qu'il doit être ÉCRIT DANS UN SCRIPT RouterOS. Entre
 * guillemets, RouterOS traite `\` comme un échappement : « \. » y serait lu
 * comme une séquence inconnue. Il faut donc doubler chaque antislash.
 */
export function dstHostPatternForScript(host: string): string {
  return dstHostPattern(host).replace(/\\/g, "\\\\");
}

export function walledGardenHosts(appHost: string, disabledHosts: string[] = []): string[] {
  const disabled = new Set(disabledHosts);
  const payment = PAYMENT_WALLED_GARDEN_HOSTS.filter((host) => !disabled.has(host));
  const cleanAppHost = sanitizeAppHost(appHost);
  const hosts = [cleanAppHost, `*.${cleanAppHost}`, ...payment];
  // Dédoublonne en préservant l'ordre (appHost pourrait recouper un motif),
  // puis convertit chaque joker en motif accepté par RouterOS.
  return [...new Set(hosts.filter(Boolean))].map(dstHostPattern);
}

// Hôte joker (*.domaine / a?b.tld) : accepté par le walled-garden L7
// (dst-host supporte * et ?), mais PAS résolvable en DNS → pas d'entrée
// « walled-garden ip » possible pour lui.
function isWildcardHost(host: string): boolean {
  return /[*?\\]/.test(host);
}

/**
 * Le walled-garden L7 (`/ip hotspot walled-garden`, dst-host) couvre bien le
 * HTTP, mais le HTTPS pré-auth est capricieux (matching SNI selon les
 * versions/situations RouterOS — cas réel : le fetch du portail vers
 * https://safelinkhub.io échouait en « Failed to fetch »). Le correctif
 * standard : doubler chaque hôte CONCRET d'une entrée
 * `/ip hotspot walled-garden ip` (action=accept, dst-host résolu en DNS →
 * entrée dynamique par IP) limitée au port 443 (tcp + udp pour HTTP/3),
 * pour ne pas ouvrir tout le trafic vers des IP partagées (Cloudflare…).
 * Les hôtes jokers restent L7-seulement (non résolvables).
 */
function walledGardenIpEntries(appHost: string, disabledHosts: string[] = []): string[] {
  return walledGardenHosts(appHost, disabledHosts).filter((h) => !isWildcardHost(h));
}

/**
 * Bloc de script RouterOS (bootstrap) : purge les entrées gérées par leur
 * commentaire puis les ré-ajoute — idempotent à chaque bootstrap. Déploie les
 * DEUX tables : walled-garden (L7, HTTP/HTTPS-SNI) + walled-garden ip
 * (L3 dynamique via DNS, indispensable au fetch HTTPS du portail).
 */
export function walledGardenScriptLines(appHost: string, disabledHosts: string[] = []): string {
  const adds = walledGardenHosts(appHost, disabledHosts)
    .map(
      (h) =>
        `/ip hotspot walled-garden add dst-host="${dstHostPatternForScript(h)}" action=allow comment="${WALLED_GARDEN_COMMENT}"`,
    )
    .join("\n");
  const ipAdds = walledGardenIpEntries(appHost, disabledHosts)
    .flatMap((h) => [
      `/ip hotspot walled-garden ip add dst-host="${h}" action=accept protocol=tcp dst-port=443 comment="${WALLED_GARDEN_COMMENT}"`,
      `/ip hotspot walled-garden ip add dst-host="${h}" action=accept protocol=udp dst-port=443 comment="${WALLED_GARDEN_COMMENT}"`,
    ])
    .join("\n");
  return [
    `/ip hotspot walled-garden remove [find comment="${WALLED_GARDEN_COMMENT}"]`,
    adds,
    `/ip hotspot walled-garden ip remove [find comment="${WALLED_GARDEN_COMMENT}"]`,
    ipAdds,
  ].join("\n");
}

/**
 * Réconcilie le walled-garden via l'API RouterOS (idempotent) : supprime les
 * entrées gérées par le commentaire, puis ré-ajoute l'ensemble courant. Appelé
 * à l'assignation d'un modèle captif → l'admin n'a pas à re-bootstrapper le
 * routeur pour activer le paiement. Ne lève pas : best-effort par entrée.
 */
// Routeurs déjà réconciliés pendant la vie de ce process, → la clé = la liste
// d'hôtes courante. Un changement de liste (nouveau déploiement) invalide la
// clé → chaque routeur est re-réconcilié UNE fois à sa prochaine sync. Vidé au
// cold start. Évite de rejouer 18 commandes à chaque health-check.
const reconciledRouters = new Map<string, string>();

/**
 * Réconcilie le walled-garden d'un routeur AU PLUS une fois par (routeur, liste
 * d'hôtes) et par process — à appeler sur chaque sync réussie (voir
 * syncRouterStats). C'est le mécanisme d'installation AUTOMATIQUE : dès qu'on
 * modifie la liste et redéploie, tous les routeurs déjà en service reçoivent la
 * mise à jour à leur prochain passage de health-check, sans action manuelle.
 * Réutilise la connexion existante (pas de tunnel supplémentaire).
 */
export async function reconcileWalledGardenOnce(
  client: RouterOSClient,
  appHost: string,
  routerId: string,
  disabledHosts: string[] = [],
): Promise<void> {
  // La clé inclut la liste effective : décocher un hôte dans Paramètres change
  // la clé → le routeur est re-réconcilié UNE fois à sa prochaine sync. Le
  // préfixe de version invalide aussi la clé quand la FORME des entrées change
  // (ex. ajout des entrées walled-garden ip pour l'HTTPS), pas juste la liste.
  const key = `wg-v2|${walledGardenHosts(appHost, disabledHosts).join(",")}`;
  if (reconciledRouters.get(routerId) === key) return;
  await ensureWalledGarden(client, appHost, disabledHosts);
  reconciledRouters.set(routerId, key); // marqué seulement si ensureWalledGarden n'a pas levé
}

export type WalledGardenResult = {
  added: string[];
  /** Entrées REFUSÉES par le routeur, avec la raison qu'il a donnée.
   *  Longtemps avalées en silence : c'est ainsi qu'un walled-garden a pu
   *  rester incomplet malgré des dizaines de réinstallations. Ce qui échoue
   *  doit se voir. */
  failed: { host: string; reason: string }[];
};

export async function ensureWalledGarden(
  client: RouterOSClient,
  appHost: string,
  disabledHosts: string[] = [],
  timeoutMs = 15000,
): Promise<WalledGardenResult> {
  // Purge des DEUX tables gérées (par commentaire) avant ré-ajout — idempotent.
  for (const path of ["/ip/hotspot/walled-garden", "/ip/hotspot/walled-garden/ip"]) {
    const existing = await client
      .talk([`${path}/print`, `?comment=${WALLED_GARDEN_COMMENT}`], timeoutMs)
      .catch(() => [] as Record<string, string>[]);
    for (const entry of existing) {
      const id = entry[".id"];
      if (id) {
        await client.talk([`${path}/remove`, `=numbers=${id}`], timeoutMs).catch(() => {});
      }
    }
  }

  const added: string[] = [];
  const failed: { host: string; reason: string }[] = [];
  for (const host of walledGardenHosts(appHost, disabledHosts)) {
    try {
      await client.talk(
        [
          "/ip/hotspot/walled-garden/add",
          `=dst-host=${host}`,
          "=action=allow",
          `=comment=${WALLED_GARDEN_COMMENT}`,
        ],
        timeoutMs,
      );
      added.push(host);
    } catch (err) {
      // On continue les autres entrées, mais on GARDE la raison : un refus
      // muet est ce qui a rendu ce défaut invisible pendant des mois.
      failed.push({ host, reason: err instanceof Error ? err.message : "refus du routeur" });
    }
  }
  // Entrées L3 (walled-garden ip, résolues en DNS) pour le HTTPS pré-auth des
  // hôtes concrets — voir walledGardenIpEntries. tcp+udp 443 (TLS + HTTP/3).
  for (const host of walledGardenIpEntries(appHost, disabledHosts)) {
    for (const protocol of ["tcp", "udp"] as const) {
      await client
        .talk(
          [
            "/ip/hotspot/walled-garden/ip/add",
            `=dst-host=${host}`,
            "=action=accept",
            `=protocol=${protocol}`,
            "=dst-port=443",
            `=comment=${WALLED_GARDEN_COMMENT}`,
          ],
          timeoutMs,
        )
        .catch((err: unknown) => {
          failed.push({
            host: `${host} (${protocol}/443)`,
            reason: err instanceof Error ? err.message : "refus du routeur",
          });
        });
    }
  }
  return { added, failed };
}
