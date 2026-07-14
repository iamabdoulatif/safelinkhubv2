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
// captif. MTN MoMo reste purement USSD/OTP (aucune page web à autoriser).
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
export function walledGardenHosts(appHost: string, disabledHosts: string[] = []): string[] {
  const disabled = new Set(disabledHosts);
  const payment = PAYMENT_WALLED_GARDEN_HOSTS.filter((host) => !disabled.has(host));
  const hosts = [appHost, `*.${appHost}`, ...payment];
  // Dédoublonne en préservant l'ordre (appHost pourrait recouper un motif).
  return [...new Set(hosts.filter(Boolean))];
}

/**
 * Bloc de script RouterOS (bootstrap) : purge les entrées gérées par leur
 * commentaire puis les ré-ajoute — idempotent à chaque bootstrap.
 */
export function walledGardenScriptLines(appHost: string, disabledHosts: string[] = []): string {
  const adds = walledGardenHosts(appHost, disabledHosts)
    .map(
      (h) =>
        `/ip hotspot walled-garden add dst-host="${h}" action=allow comment="${WALLED_GARDEN_COMMENT}"`,
    )
    .join("\n");
  return `/ip hotspot walled-garden remove [find comment="${WALLED_GARDEN_COMMENT}"]\n${adds}`;
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
  // la clé → le routeur est re-réconcilié UNE fois à sa prochaine sync.
  const key = walledGardenHosts(appHost, disabledHosts).join(",");
  if (reconciledRouters.get(routerId) === key) return;
  await ensureWalledGarden(client, appHost, disabledHosts);
  reconciledRouters.set(routerId, key); // marqué seulement si ensureWalledGarden n'a pas levé
}

export async function ensureWalledGarden(
  client: RouterOSClient,
  appHost: string,
  disabledHosts: string[] = [],
  timeoutMs = 15000,
): Promise<{ added: string[] }> {
  const existing = await client
    .talk(["/ip/hotspot/walled-garden/print", `?comment=${WALLED_GARDEN_COMMENT}`], timeoutMs)
    .catch(() => [] as Record<string, string>[]);
  for (const entry of existing) {
    const id = entry[".id"];
    if (id) {
      await client
        .talk(["/ip/hotspot/walled-garden/remove", `=numbers=${id}`], timeoutMs)
        .catch(() => {});
    }
  }
  const added: string[] = [];
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
    } catch {
      // best-effort : une entrée qui échoue ne doit pas bloquer les autres.
    }
  }
  return { added };
}
