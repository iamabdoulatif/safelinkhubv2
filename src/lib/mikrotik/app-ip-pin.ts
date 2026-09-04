// L'ANCRAGE PAR ADRESSE : la seule forme qui ne dépend de personne.
//
// Le walled-garden autorisait safelinkhub.io par son NOM. Trois maillons
// devaient alors s'aligner pour qu'un client pas encore authentifié atteigne
// l'application en HTTPS :
//   1. le routeur devait résoudre le nom lui-même, pour transformer sa règle
//      `dst-host` en adresses acceptées ;
//   2. le téléphone devait résoudre le MÊME nom vers la MÊME adresse ;
//   3. les deux résolutions devaient rester d'accord dans le temps.
// L'application est derrière Cloudflare (deux adresses, TTL de 5 minutes) : il
// suffit qu'un maillon lâche — résolveur du routeur en panne, réponse servie à
// un autre nœud, cache expiré d'un côté seulement — pour que la connexion soit
// jetée. Le portail affiche alors « Connexion à safelinkhub.io impossible » et
// le diagnostic, lui, voit bien la règle : elle EXISTE, elle ne matche pas.
//
// On supprime donc les trois maillons d'un coup : SafeLinkHub résout le nom de
// son côté (il sait mieux que personne où il est), épingle ces adresses dans le
// DNS du routeur pour que les téléphones obtiennent exactement celles-là, et
// autorise ces MÊMES adresses en dur dans le walled-garden. Plus rien à
// résoudre côté routeur, plus rien à faire coïncider.
//
// Les entrées portent le commentaire de gestion : elles sont purgées puis
// reposées à chaque réconciliation, donc un changement d'adresse chez
// Cloudflare est rattrapé au prochain passage (10 fois par jour).

/** Commentaire des entrées épinglées — purge ciblée, jamais les vôtres. */
export const APP_PIN_COMMENT = "safelinkhub-app-pin";

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/** Adresses IPv4 valides, dédoublonnées, ordre d'origine, au plus `max`. */
export function sanitizeAppAddresses(addresses: readonly string[], max = 4): string[] {
  const vues = new Set<string>();
  const propres: string[] = [];
  for (const brut of addresses) {
    const adresse = String(brut ?? "").trim();
    const m = IPV4.exec(adresse);
    if (!m) continue;
    if (m.slice(1).some((octet) => Number(octet) > 255)) continue;
    if (vues.has(adresse)) continue;
    vues.add(adresse);
    propres.push(adresse);
    if (propres.length >= max) break;
  }
  return propres;
}

/** Commandes de purge des entrées épinglées (par id, résolus par l'appelant). */
export function pinPurgeCommand(path: string, id: string): string[] {
  return [`${path}/remove`, `=numbers=${id}`];
}

/**
 * Commandes d'ancrage, dans l'ordre : d'abord le DNS (le téléphone obtiendra
 * ces adresses-là), puis les autorisations pré-connexion sur ces adresses.
 * TCP et UDP : un navigateur moderne tente HTTP/3 (QUIC) sur le même port 443,
 * et un QUIC bloqué se solde par une attente puis un échec.
 */
export function pinCommands(appHost: string, addresses: readonly string[]): string[][] {
  const propres = sanitizeAppAddresses(addresses);
  const cmds: string[][] = [];
  for (const adresse of propres) {
    cmds.push([
      "/ip/dns/static/add",
      `=name=${appHost}`,
      `=address=${adresse}`,
      "=ttl=5m",
      `=comment=${APP_PIN_COMMENT}`,
    ]);
  }
  for (const adresse of propres) {
    for (const protocol of ["tcp", "udp"] as const) {
      cmds.push([
        "/ip/hotspot/walled-garden/ip/add",
        `=dst-address=${adresse}`,
        "=action=accept",
        `=protocol=${protocol}`,
        "=dst-port=443",
        `=comment=${APP_PIN_COMMENT}`,
      ]);
    }
  }
  return cmds;
}

/** Les adresses réellement acceptées sur le routeur, d'après les lignes lues. */
export function pinnedAddresses(rows: Record<string, string | undefined>[]): string[] {
  return [
    ...new Set(
      rows
        .filter((r) => (r.comment ?? "") === APP_PIN_COMMENT)
        .map((r) => String(r["dst-address"] ?? "").trim())
        .filter(Boolean),
    ),
  ];
}

/** Adresses attendues qui ne sont pas (ou plus) acceptées sur le routeur. */
export function missingPins(attendues: readonly string[], rows: Record<string, string | undefined>[]): string[] {
  const posees = new Set(pinnedAddresses(rows));
  return sanitizeAppAddresses(attendues).filter((a) => !posees.has(a));
}
