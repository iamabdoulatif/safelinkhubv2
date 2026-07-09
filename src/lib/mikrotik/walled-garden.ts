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
];

/** Ensemble complet du walled-garden pour une install : app + paiement. */
export function walledGardenHosts(appHost: string): string[] {
  const hosts = [appHost, `*.${appHost}`, ...PAYMENT_WALLED_GARDEN_HOSTS];
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
