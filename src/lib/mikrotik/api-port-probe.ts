/**
 * Quel port API le routeur écoute-t-il RÉELLEMENT ?
 *
 * POURQUOI CE MODULE EXISTE. `routers.api_port` est une valeur que SafeLinkHub
 * garde de son côté ; rien ne la resynchronise si l'exploitant déplace le
 * service `api` dans WinBox — ce qui est un durcissement courant, 8728 étant
 * balayé en permanence. La connexion échoue alors sur « Channel open failure:
 * Connection refused », un message qui ne nomme même pas le port, et le
 * routeur passe pour injoignable alors qu'il répond parfaitement à côté.
 *
 * LA SONDE N'A BESOIN D'AUCUN IDENTIFIANT : elle ouvre un canal TCP par le
 * tunnel et regarde s'il s'établit. C'est ce qui la rend utilisable là où tout
 * le reste est déjà bloqué — un diagnostic qui exige la connexion qu'il est
 * censé réparer ne sert à rien.
 *
 * Ce qu'elle ne fait PAS : parler le protocole RouterOS. Un port ouvert n'est
 * pas la preuve que l'API est derrière — d'où « répond » et jamais « c'est
 * l'API ». La confirmation vient de la connexion qui suit.
 */

/**
 * Ports essayés, dans l'ordre.
 *
 * Le port configuré passe EN PREMIER : s'il répond, on s'arrête là et aucun
 * autre port du routeur n'est touché. Les suivants sont les deux valeurs par
 * défaut de RouterOS. On ne balaie pas au-delà : sonder des ports au hasard
 * sur l'équipement d'un client ressemblerait à un scan, et n'apprendrait rien
 * — un port non standard choisi par l'exploitant est de toute façon
 * introuvable par énumération.
 */
export function candidatePorts(configuredPort: number | null | undefined): number[] {
  const vus = new Set<number>();
  const sortie: number[] = [];
  for (const p of [configuredPort ?? 8728, 8728, 8729]) {
    if (Number.isInteger(p) && p > 0 && p < 65536 && !vus.has(p)) {
      vus.add(p);
      sortie.push(p);
    }
  }
  return sortie;
}

export type ApiPortVerdict =
  | { kind: "ok"; port: number }
  | { kind: "mismatch"; configured: number; found: number }
  | { kind: "unreachable"; tried: number[] };

/**
 * Lit le résultat des sondes. Fonction PURE : la partie réseau reste chez
 * l'appelant, pour que la décision soit testable sans routeur.
 *
 * @param results ports qui ont accepté une connexion, dans l'ordre d'essai.
 */
export function readApiPortProbe(
  configured: number | null | undefined,
  tried: readonly number[],
  reachable: readonly number[],
): ApiPortVerdict {
  const attendu = configured ?? 8728;
  if (reachable.includes(attendu)) return { kind: "ok", port: attendu };
  const trouve = reachable[0];
  if (trouve === undefined) return { kind: "unreachable", tried: [...tried] };
  return { kind: "mismatch", configured: attendu, found: trouve };
}

/** Ce que lit l'exploitant dans le diagnostic. */
export function describeApiPortVerdict(v: ApiPortVerdict): {
  titre: string;
  detail: string;
  /** Vrai quand un bouton peut corriger tout seul. */
  corrigible: boolean;
} {
  switch (v.kind) {
    case "ok":
      return {
        titre: `Port API joignable (${v.port})`,
        detail: "Le tunnel atteint le port API enregistré pour ce routeur.",
        corrigible: false,
      };
    case "mismatch":
      return {
        titre: `Port API erroné (${v.configured} → ${v.found})`,
        detail:
          `SafeLinkHub tente le port ${v.configured}, qui refuse la connexion, alors que ` +
          `le routeur répond sur ${v.found}. C'est ce décalage qui produit « Connection ` +
          `refused » sur toutes les actions du routeur. La correction n'écrit RIEN sur ` +
          `l'équipement : elle met à jour le port que SafeLinkHub compose.`,
        corrigible: true,
      };
    case "unreachable":
      return {
        titre: "Aucun port API ne répond",
        detail:
          `Ports essayés : ${v.tried.join(", ")}. Le service « api » est peut-être ` +
          `désactivé, restreint à d'autres adresses que celle du tunnel, ou posé sur un ` +
          `port non standard — dans ce dernier cas il faut le saisir à la main, une ` +
          `énumération ne le trouverait pas. À vérifier dans WinBox : IP → Services.`,
        corrigible: false,
      };
  }
}

/* ── Partie réseau ────────────────────────────────────────────────────────
   Séparée des fonctions ci-dessus pour que la décision reste testable sans
   routeur ; ici on ne fait qu'ouvrir des canaux et noter lesquels tiennent. */

/**
 * Un canal TCP s'ouvre-t-il vers ce port, à travers le tunnel ?
 *
 * On referme AUSSITÔT : la question est « quelque chose écoute-t-il ? », pas
 * « que dit-il ». Délai court — un port filtré doit être conclu vite, la sonde
 * tourne pendant qu'un exploitant attend devant son écran.
 */
async function portRepond(
  tunnelIp: string,
  port: number,
  openTunnel: (ip: string, p: number, t: number) => Promise<{ close: () => void }>,
): Promise<boolean> {
  try {
    const t = await openTunnel(tunnelIp, port, 6000);
    t.close();
    return true;
  } catch {
    return false;
  }
}

/**
 * Sonde les ports candidats d'un routeur et rend le verdict.
 *
 * S'arrête au PREMIER port qui répond : si le port enregistré est le bon (le
 * cas courant), aucun autre port de l'équipement n'est touché.
 */
export async function probeApiPortWith(
  tunnelIp: string,
  configuredPort: number | null | undefined,
  openTunnel: (ip: string, p: number, t: number) => Promise<{ close: () => void }>,
): Promise<ApiPortVerdict> {
  const candidats = candidatePorts(configuredPort);
  const joignables: number[] = [];
  for (const p of candidats) {
    if (await portRepond(tunnelIp, p, openTunnel)) {
      joignables.push(p);
      break;
    }
  }
  return readApiPortProbe(configuredPort, candidats, joignables);
}
