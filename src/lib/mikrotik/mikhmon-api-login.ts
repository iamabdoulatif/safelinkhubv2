/**
 * Le routeur DIT lui-même pourquoi MikHmon n'affiche pas de tickets.
 *
 * Relevé sur KONGASSO-HTSPT le 2026-09-02, dans /log :
 *
 *   05:46:47  user safelinkhub-api logged in from 10.66.0.1 via api      ← l'app
 *   05:50:49  login failure for user safelinkhub-api from 11.11.11.11 via api   ← MikHmon
 *
 * MÊME compte, MÊME routeur, deux résultats : le mot de passe que le conteneur
 * détient est périmé, celui que SafeLinkHub détient est bon. Ça arrive dès que
 * la session MikHmon a été saisie à la main (ou par un ancien chemin
 * d'installation) au lieu d'être écrite par l'app : plus rien ne les
 * resynchronise ensuite.
 *
 * Rien d'autre ne le montre. Le réseau est bon, le service API autorise le
 * conteneur, le pare-feu laisse passer, le conteneur tourne — on ne voit qu'un
 * « MikroTik Not Connected » dans MikHmon et une page de tickets vide. Le
 * journal est la seule source qui tranche, et elle est sans ambiguïté.
 *
 * Le correctif est déjà là : « Reconfigurer la session » réécrit le config.php
 * du conteneur avec les identifiants de l'app — ceux dont on vient de vérifier
 * qu'ils marchent.
 */

/** `login failure for user X from IP via api` */
const ECHEC = /login failure for user (\S+) from (\S+) via api/;
/** `user X logged in from IP via api` */
const SUCCES = /user (\S+) logged in from (\S+) via api/;

export type LogRow = { time?: string; message?: string };

export type MikhmonLoginState =
  /** Le journal ne dit rien du conteneur — on n'invente pas de constat. */
  | { state: "unknown" }
  | { state: "ok"; user: string; at: string }
  | { state: "rejected"; user: string; at: string; failures: number };

/**
 * Verdict sur les tentatives de connexion API VENUES DU CONTENEUR.
 *
 * C'est le DERNIER événement qui décide, pas le décompte : le journal est un
 * tampon circulaire qui garde les échecs d'avant la réparation. Compter les
 * lignes ferait re-signaler un routeur déjà réparé.
 */
export function inspectMikhmonApiLogins(
  rows: LogRow[],
  containerIp: string,
): MikhmonLoginState {
  let last: MikhmonLoginState = { state: "unknown" };
  let failures = 0;

  for (const row of rows) {
    const message = String(row.message ?? "");
    const at = String(row.time ?? "");

    const echec = ECHEC.exec(message);
    if (echec && echec[2] === containerIp) {
      failures++;
      last = { state: "rejected", user: echec[1], at, failures };
      continue;
    }
    const succes = SUCCES.exec(message);
    if (succes && succes[2] === containerIp) {
      // Une réussite efface l'ardoise : les échecs d'avant sont de l'histoire.
      failures = 0;
      last = { state: "ok", user: succes[1], at };
    }
  }

  return last;
}
