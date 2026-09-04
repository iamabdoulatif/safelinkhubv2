/**
 * Tickets dont la date d'expiration a été écrite au format ISO — donc
 * invisibles au balayage qui les supprime.
 *
 * CE QUI SE PASSE. L'expiration d'un ticket hotspot vit dans le `comment` de
 * l'utilisateur MikroTik, au format MikHmon « mmm/JJ/AAAA HH:MM:SS ». Le
 * planificateur de chaque profil balaie les comptes périmés avec ce test :
 *
 *     :if ([:pic $comment 3] = "/" and [:pic $comment 6] = "/") do={ … }
 *
 * RouterOS 7.24 rend désormais les dates en ISO — « 2026-08-24 » là où les
 * versions précédentes rendaient « aug/24/2026 ». Le script `on-login` de
 * MikHmon convertit ce format… mais pas toutes les formes rendues par
 * `/system scheduler get next-run`. Quand la conversion n'a pas lieu, c'est la
 * chaîne ISO BRUTE qui atterrit dans le commentaire.
 *
 * Conséquence : les positions 3 et 6 ne sont plus des « / », le balayage passe
 * son chemin, et le ticket ne s'éteint JAMAIS. Le `on-login` ne le rattrape pas
 * non plus : il ne (re)pose une date que si le commentaire est vide ou commence
 * par « vc »/« up ».
 *
 * Mesuré sur HTSPT-TREW le 2026-08-24 : 137 tickets dans ce cas, dont un daté
 * du 15 mars encore actif cinq mois plus tard.
 *
 * LA CORRECTION est une simple RÉÉCRITURE de format : même instant, écrit
 * comme MikHmon l'attend. Aucun script du routeur n'est touché — le balayage
 * déjà en place reprend son travail au passage suivant. Rien n'est supprimé
 * ici : c'est le routeur qui décidera, avec ses propres règles.
 */

const MOIS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/* Les deux formats n'ont PAS la même longueur — c'est tout le piège de cette
   conversion : « 2026-08-24 20:15:40 » fait 19 caractères, « aug/24/2026
   20:15:40 » en fait 20. Le champ libre commence donc après le séparateur, à
   20 côté ISO et à 21 côté MikHmon (la constante de reconcile.ts).
   Se tromper d'un cran amputait la première lettre du commentaire. */
const CORPS_A_ISO = 20;

/** « 2026-08-24 20:15:40 » — la forme rendue par RouterOS 7.24. */
export function isIsoExpiryComment(comment: string): boolean {
  return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(comment);
}

/** « aug/24/2026 20:15:40 » — la forme que le balayage sait lire. */
export function isMikhmonExpiryComment(comment: string): boolean {
  return comment.length >= 20 && comment[3] === "/" && comment[6] === "/";
}

/**
 * Convertit un commentaire ISO en commentaire MikHmon, champ libre préservé.
 * Rend `null` si l'entrée n'est pas de l'ISO ou si la date est absurde — on ne
 * réécrit jamais un commentaire qu'on n'a pas compris.
 */
export function isoToMikhmonComment(comment: string): string | null {
  if (!isIsoExpiryComment(comment)) return null;
  const annee = Number(comment.slice(0, 4));
  const mois = Number(comment.slice(5, 7));
  const jour = Number(comment.slice(8, 10));
  const heure = comment.slice(11, 19);
  if (mois < 1 || mois > 12 || jour < 1 || jour > 31) return null;

  const converti = `${MOIS[mois - 1]}/${String(jour).padStart(2, "0")}/${annee} ${heure}`;
  // Le champ libre de MikHmon (notre « debut … ») vit après la position 21 :
  // le perdre effacerait la date de première connexion affichée à l'opérateur.
  const corps = comment.length > CORPS_A_ISO ? comment.slice(CORPS_A_ISO) : "";
  return corps ? `${converti} ${corps}` : converti;
}

/**
 * « jan/02/sep/  21:40:3 » — une date dont l'ANNÉE est un nom de mois.
 *
 * Elle naît d'une double conversion : un script `on-login` qui gère déjà
 * l'horloge ISO, auquel on a ajouté une seconde conversion. La première rend
 * « sep/06/2026 21:40:30 », la seconde la relit comme si c'était encore de
 * l'ISO et en tire cette bouillie. Voir onLoginHandlesIsoClock, qui empêche
 * désormais l'insertion en double.
 *
 * Le balayage la traite comme une vraie date — positions 3 et 6 sont bien des
 * « / » — puis compare une année « sep/ » : aucune comparaison n'est vraie, le
 * ticket ne s'éteint JAMAIS. Mesuré sur HSPT-FOUANGA : 202 tickets en deux
 * jours, dont 120 en cours d'utilisation.
 */
export function isCorruptedExpiryComment(comment: string): boolean {
  return /^[a-z]{3}\/\d{2}\/[a-z]{3}\//i.test(comment);
}

/** Une date au format du balayage, pour un instant donné. */
export function formatMikhmonComment(instant: Date): string {
  const p2 = (n: number) => String(n).padStart(2, "0");
  return (
    `${MOIS[instant.getUTCMonth()]}/${p2(instant.getUTCDate())}/${instant.getUTCFullYear()} ` +
    `${p2(instant.getUTCHours())}:${p2(instant.getUTCMinutes())}:${p2(instant.getUTCSeconds())}`
  );
}

const SECONDES_PAR_UNITE: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400, w: 604800 };

/**
 * Durée d'un forfait, lue dans le `on-login` de son profil — c'est
 * l'intervalle du planificateur temporaire que MikHmon y pose. La déduire du
 * NOM du profil (« 02-JOURS ») serait deviner : un exploitant renomme.
 */
export function profileDurationsSeconds(
  profiles: Record<string, string | undefined>[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of profiles) {
    const nom = p.name;
    const m = (p["on-login"] ?? "").match(/interval="(\d+)([smhdw])"/);
    if (nom && m) out[nom] = Number(m[1]) * SECONDES_PAR_UNITE[m[2]];
  }
  return out;
}

export type ExpiryFormatInspection = {
  /** Tickets porteurs d'une date ISO — ceux qui n'expireront jamais. */
  isoCount: number;
  /** Tickets dont la date est corrompue (année = nom de mois). */
  corruptedCount: number;
  /** Tickets au format attendu par le balayage. */
  mikhmonCount: number;
  /** Ni l'un ni l'autre : bons de commande non utilisés (« vc-… »), notes… */
  otherCount: number;
  /** Les lignes à réécrire, prêtes à être poussées. */
  aReecrire: { id: string; name: string; from: string; to: string }[];
};

/** Fonction PURE : la décision se teste sans routeur. */
export function inspectExpiryFormats(
  /* `Record<string, string>` et non un type fermé : c'est ce que rend le
     client RouterOS, dont les sentences sont des dictionnaires libres. */
  users: Record<string, string | undefined>[],
  /* Durées par profil, pour reconstruire une date corrompue. Absentes = on
     COMPTE ces tickets sans les réécrire : mieux vaut un constat qu'une date
     inventée. */
  durations: Record<string, number> = {},
  now = new Date(),
): ExpiryFormatInspection {
  let isoCount = 0;
  let corruptedCount = 0;
  let mikhmonCount = 0;
  let otherCount = 0;
  const aReecrire: ExpiryFormatInspection["aReecrire"] = [];

  for (const u of users) {
    const comment = u.comment ?? "";
    if (isIsoExpiryComment(comment)) {
      isoCount++;
      const to = isoToMikhmonComment(comment);
      if (to && u[".id"]) aReecrire.push({ id: u[".id"], name: u.name ?? "?", from: comment, to });
    } else if (isCorruptedExpiryComment(comment)) {
      /* La vraie échéance est PERDUE — la corruption a mangé l'année. On
         repart de maintenant + la durée du forfait : le client garde au pire
         une période de trop, là où l'expirer sur-le-champ couperait une
         session en cours et l'ISO ne dit rien de récupérable. */
      corruptedCount++;
      const duree = durations[u.profile ?? ""];
      if (duree && u[".id"]) {
        aReecrire.push({
          id: u[".id"],
          name: u.name ?? "?",
          from: comment,
          to: formatMikhmonComment(new Date(now.getTime() + duree * 1000)),
        });
      }
    } else if (isMikhmonExpiryComment(comment)) mikhmonCount++;
    else otherCount++;
  }

  return { isoCount, corruptedCount, mikhmonCount, otherCount, aReecrire };
}
