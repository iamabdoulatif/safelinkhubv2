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

// Domaines de paiement autorisés (hors app SafeLinkHub). On liste les hôtes
// vers lesquels le checkout redirige le navigateur du client :
// - GeniusPay héberge le checkout (pay.genius.ci) ;
// - Wave : redirection vers wave.com (doc GeniusPay) ;
// - Orange Money Web Payment : webpayment.orange-money.com (+ variantes
//   sandbox / *.orange.ci pour la CI) ;
// - Moov Money (Moov Africa) : page de validation web hébergée sous
//   moov-africa.ci / .com selon le pays → whitelistée par sécurité.
// NON listé : cartes (Visa/Mastercard) — 3-D Secure redirige vers l'ACS de la
// banque émettrice (domaine arbitraire), non whitelistable derrière un portail
// captif. MTN MoMo reste purement USSD/OTP (aucune page web à autoriser).
export const PAYMENT_WALLED_GARDEN_HOSTS = [
  // GeniusPay : API sur pay.genius.ci, mais le CHECKOUT (où le client est
  // redirigé) est servi sur geniuspay.ci — domaine distinct, à autoriser aussi.
  "pay.genius.ci",
  "*.genius.ci",
  "geniuspay.ci",
  "*.geniuspay.ci",
  // CDN d'assets de la page de checkout GeniusPay (sinon page cassée : le CSS
  // Tailwind, les libs JS et les polices sont chargés depuis ces domaines).
  "cdn.tailwindcss.com",
  "cdn.jsdelivr.net",
  "fonts.googleapis.com",
  "fonts.gstatic.com",
  // Paystack : GeniusPay délègue l'ENCAISSEMENT à Paystack (checkout + widget
  // JS). Sans ces domaines, seul Orange Money (géré à part) marche ; Wave, MTN,
  // Moov et carte — tous servis via Paystack — échouent au portail captif.
  "paystack.com",
  "*.paystack.com",
  "paystack.co",
  "*.paystack.co",
  // Wave
  "wave.com",
  "*.wave.com",
  // Orange Money
  "webpayment.orange-money.com",
  "*.orange-money.com",
  "*.orange.ci",
  // Moov Money (Moov Africa)
  "moov-africa.ci",
  "*.moov-africa.ci",
  "*.moov-africa.com",
  // Paystack (carte bancaire) : page de saisie checkout.paystack.com + API.
  // NB : le 3-D Secure peut rediriger vers l'ACS de la banque (domaine
  // arbitraire, non whitelistable) → les cartes 3DS peuvent échouer sur captif ;
  // les cartes sans 3DS passent. Le repli « ouvrir dans le navigateur » aide.
  "checkout.paystack.com",
  "*.paystack.com",
  "*.paystack.co",
];

// Hôtes de DÉTECTION de portail captif d'Apple (iOS / macOS). En les autorisant,
// la sonde iOS (http://captive.apple.com/hotspot-detect.html) atteint Apple et
// reçoit sa vraie page « Success » → iOS considère le réseau comme EN LIGNE et
// n'ouvre PAS son mini-navigateur (CNA), bridé et incapable d'afficher le
// checkout Paystack / 3-D Secure. Le client ouvre alors Safari lui-même
// (n'importe quel site http est redirigé vers le portail, dans le VRAI Safari où
// le paiement marche). C'est le remplaçant du schéma x-safari-https:// (peu
// fiable selon la version d'iOS).
//
// Compromis ASSUMÉ : plus de pop-up automatique sur iPhone → il faut guider le
// client (« Connectez-vous au WiFi, puis ouvrez Safari »).
//
// ⚠️ iOS UNIQUEMENT. On n'ajoute PAS les hôtes de sonde Android
// (connectivitycheck.gstatic.com) ni Windows (msftconnecttest.com) : là le
// portail s'ouvre déjà dans un vrai navigateur et le paiement fonctionne — les
// neutraliser casserait ce qui marche. On évite aussi le joker *.apple.com pour
// ne pas offrir App Store / iCloud gratuits ; on liste les hôtes de sonde connus
// (versions iOS actuelles + héritées).
export const APPLE_CAPTIVE_DETECTION_HOSTS = [
  "captive.apple.com",
  "www.apple.com",
  "www.appleiphonecell.com",
  "www.itools.info",
  "www.ibook.info",
  "www.airport.us",
  "www.thinkdifferent.us",
];

/** Ensemble complet du walled-garden pour une install : app + paiement + sonde captive Apple. */
export function walledGardenHosts(appHost: string): string[] {
  const hosts = [
    appHost,
    `*.${appHost}`,
    ...PAYMENT_WALLED_GARDEN_HOSTS,
    ...APPLE_CAPTIVE_DETECTION_HOSTS,
  ];
  // Dédoublonne en préservant l'ordre (appHost pourrait recouper un motif).
  return [...new Set(hosts.filter(Boolean))];
}

/**
 * Bloc de script RouterOS (bootstrap) : purge les entrées gérées par leur
 * commentaire puis les ré-ajoute — idempotent à chaque bootstrap.
 */
export function walledGardenScriptLines(appHost: string): string {
  const adds = walledGardenHosts(appHost)
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
): Promise<void> {
  const key = walledGardenHosts(appHost).join(",");
  if (reconciledRouters.get(routerId) === key) return;
  await ensureWalledGarden(client, appHost);
  reconciledRouters.set(routerId, key); // marqué seulement si ensureWalledGarden n'a pas levé
}

export async function ensureWalledGarden(
  client: RouterOSClient,
  appHost: string,
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
  for (const host of walledGardenHosts(appHost)) {
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
