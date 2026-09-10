/**
 * Plafond de VOLUME d'un ticket hotspot.
 *
 * Le `rate-limit` d'un profil borne la VITESSE ; il ne borne pas ce qu'un
 * client télécharge en 24 h. Sur un lien facturé au gigaoctet (Starlink et
 * consorts), c'est le volume qui coûte. RouterOS sait le faire par COMPTE
 * hotspot — pas par profil — via `limit-bytes-total`, d'où un mot ajouté à la
 * création du compte plutôt qu'un champ de profil.
 *
 * `limit-bytes-total` (et non `limit-bytes-out`) : il compte les deux sens.
 * Un plafond qui ne regarde que la descente laisse une sauvegarde cloud ou un
 * envoi vidéo saturer le lien sans jamais entamer le quota, alors que
 * l'opérateur, lui, paie les deux sens.
 *
 * Atteint, RouterOS déconnecte la session et refuse la reconnexion : le ticket
 * est consommé même s'il lui restait du temps. C'est le comportement voulu.
 */

/** Mo → octets. Base 1024 : « 3 Go » = 3 072 Mo = 3 221 225 472 octets. */
const BYTES_PER_MB = 1024 * 1024;

/**
 * Mot RouterOS `=limit-bytes-total=` pour un plafond en Mo, à étaler dans un
 * `/ip/hotspot/user/add`. Renvoie une liste VIDE quand il n'y a pas de
 * plafond : ne jamais émettre `=limit-bytes-total=0`, qui est la valeur
 * « illimité » de RouterOS mais écrase un réglage posé à la main sur le
 * routeur. Rien à dire = rien à écrire.
 */
export function dataCapWords(dataCapMb: number | null | undefined): string[] {
  if (typeof dataCapMb !== "number" || !Number.isFinite(dataCapMb) || dataCapMb <= 0) {
    return [];
  }
  return [`=limit-bytes-total=${Math.round(dataCapMb) * BYTES_PER_MB}`];
}

/** Libellé lisible d'un plafond, ou null s'il n'y en a pas. Ex. 3072 → « 3 Go ». */
export function dataCapLabel(dataCapMb: number | null | undefined): string | null {
  if (typeof dataCapMb !== "number" || !Number.isFinite(dataCapMb) || dataCapMb <= 0) {
    return null;
  }
  const mb = Math.round(dataCapMb);
  if (mb % 1024 === 0) return `${mb / 1024} Go`;
  if (mb >= 1024) return `${(mb / 1024).toFixed(1).replace(".", ",")} Go`;
  return `${mb} Mo`;
}
