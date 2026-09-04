// Le walled-garden est-il RÉELLEMENT en place sur ce routeur ?
//
// Cas réel (YAHYA WIFI) : au clic sur « Recevoir le code », le portail affiche
// « Connexion à safelinkhub.io impossible depuis ce WiFi ». Ce message est le
// nôtre, et il dit la vérité : la requête n'a jamais quitté le réseau captif.
// Rien à voir avec le SMS — un client non authentifié n'a le droit de joindre
// que les hôtes du walled-garden, et safelinkhub.io n'y était pas (ou plus).
//
// Le walled-garden est pourtant réinstallé tout seul à chaque synchronisation…
// pour les routeurs qui se synchronisent. Un routeur resté longtemps hors
// contact, restauré depuis une sauvegarde, ou empoisonné par un environnement
// de développement (entrées « 0.0.0.0:3000 » — voir sanitizeAppHost) garde une
// liste périmée sans que rien ne le signale. D'où ce constat : on compare ce
// qui est POSÉ sur le routeur à ce qui DEVRAIT y être, et on nomme l'écart.
//
// Deux tables, deux rôles (voir walled-garden.ts) : la L7 (`walled-garden`,
// dst-host) couvre le HTTP, la L3 (`walled-garden ip`, port 443) le HTTPS.
// L'app est jointe en HTTPS : l'oubli de la seconde suffit à tout bloquer.

type Row = Record<string, string | undefined>;

export type WalledGardenState = {
  /** Hôtes autorisés en L7 (HTTP), toutes entrées confondues. */
  poses: string[];
  /** Hôtes autorisés en L3 sur 443 (HTTPS). */
  posesIp: string[];
  /** Attendus mais absents de la table L7. */
  manquants: string[];
  /** Attendus mais absents de la table L3 — l'app devient injoignable en HTTPS. */
  manquantsIp: string[];
  /** Entrées posées par SafeLinkHub qui ne correspondent à aucun hôte attendu :
   *  reliquat d'un déploiement précédent ou d'un serveur de développement. */
  perimes: string[];
  /** L'hôte de l'application est-il joignable dans les DEUX tables ? */
  appJoignable: boolean;
};

function hosts(rows: Row[]): string[] {
  return rows
    .map((r) => String(r["dst-host"] ?? "").trim().toLowerCase())
    .filter(Boolean);
}

export function inspectWalledGarden(
  l7Rows: Row[],
  ipRows: Row[],
  attendus: { l7: string[]; ip: string[]; appHost: string },
): WalledGardenState {
  const poses = hosts(l7Rows);
  const posesIp = hosts(ipRows);
  const vus = new Set(poses);
  const vusIp = new Set(posesIp);
  const attenduSet = new Set([...attendus.l7, ...attendus.ip].map((h) => h.toLowerCase()));
  const app = attendus.appHost.toLowerCase();

  return {
    poses,
    posesIp,
    manquants: attendus.l7.filter((h) => !vus.has(h.toLowerCase())),
    manquantsIp: attendus.ip.filter((h) => !vusIp.has(h.toLowerCase())),
    perimes: [...new Set([...poses, ...posesIp])].filter((h) => !attenduSet.has(h)),
    appJoignable: vus.has(app) && vusIp.has(app),
  };
}

/** Bloquant = l'app n'est pas joignable. Un hôte de paiement manquant gêne un
 *  rail donné ; l'app manquante empêche TOUTE vente, c'est autre chose. */
export function walledGardenBloquant(state: WalledGardenState): boolean {
  return !state.appJoignable;
}

export function walledGardenIncomplet(state: WalledGardenState): boolean {
  return state.manquants.length > 0 || state.manquantsIp.length > 0 || state.perimes.length > 0;
}

export function walledGardenDetail(state: WalledGardenState, appHost: string): string {
  const parts: string[] = [];
  if (!state.appJoignable) {
    parts.push(
      `${appHost} n'est pas autorisé avant connexion : le portail affiche « Connexion à ${appHost} impossible depuis ce WiFi » et aucun client ne peut acheter.`,
    );
  }
  if (state.manquants.length > 0) {
    parts.push(`Manque en HTTP : ${state.manquants.join(", ")}.`);
  }
  if (state.manquantsIp.length > 0) {
    parts.push(
      `Manque en HTTPS (port 443) : ${state.manquantsIp.join(", ")} — c'est par là que passe le portail.`,
    );
  }
  if (state.perimes.length > 0) {
    parts.push(
      `Entrées périmées à retirer : ${state.perimes.join(", ")} (reliquat d'une ancienne adresse d'application).`,
    );
  }
  parts.push("Le correctif réinstalle la liste complète, sans toucher à vos entrées manuelles.");
  return parts.join(" ");
}
