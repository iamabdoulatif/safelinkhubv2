/**
 * « LE PORTAIL N'APPARAÎT PAS » — lire la panne dans le journal du hotspot.
 *
 * Relevé sur HSPT-FOUANGA (11/09/2026) : les clients obtenaient une adresse,
 * le journal montrait des dizaines de « trying to log in by mac » suivis de
 * « login failed » — l'essai d'auto-login MAC que RouterOS fait pour chaque
 * nouvel appareil, normal — puis PLUS RIEN. Seuls les appareils déjà connus
 * revenaient (« mac-cookie »). Sur trois heures : 206 cookies, ZÉRO formulaire.
 * Un routeur sain voit un « http-pap »/« http-chap » toutes les deux minutes.
 *
 * La cause était le proxy DNS interne du hotspot, mort en silence : chaque
 * requête DNS d'un client tombait sur un port sans écouteur, donc pas de sonde
 * HTTP, pas de redirection, pas de page. `proxy-status=running` restait vrai —
 * il ne décrit que le proxy HTTP — et aucun contrôle existant ne le voyait.
 * Il a fallu un sniffer, que le compte de la plateforme n'a pas le droit
 * d'utiliser.
 *
 * Ce module lit la même signature SANS sniffer, dans le journal que le
 * diagnostic charge déjà : beaucoup de nouveaux appareils, aucun formulaire
 * soumis. Pur : testable sur des lignes de journal.
 */

/** Nouveaux appareils distincts à partir desquels « aucun formulaire » devient un verdict, pas un hasard. */
export const PORTAL_MIN_NEW_DEVICES = 8;

export type PortalHealth = {
  /** Appareils distincts ayant échoué l'auto-login MAC = nouveaux venus. */
  newDevices: number;
  /** Tentatives par le formulaire du portail (http-pap / http-chap). */
  formLogins: number;
  /** Reconnexions automatiques d'appareils déjà connus. */
  cookieLogins: number;
  /**
   * `suspect` : assez de nouveaux appareils et pas un seul formulaire — le
   * portail ne s'affiche probablement pas.
   * `ok` : au moins un formulaire soumis, la page est atteinte.
   * `unknown` : trop peu de nouveaux appareils pour trancher.
   */
  verdict: "ok" | "suspect" | "unknown";
};

const MAC = /([0-9A-F]{2}:){5}[0-9A-F]{2}/i;

/**
 * `messages` : le champ `message` des lignes `/log print` du sujet hotspot,
 * dans l'ordre. RouterOS double chaque ligne d'une variante préfixée « ->: »
 * (le sens de la trace) ; on ne compte qu'une fois.
 */
export function assessPortalHealth(messages: readonly string[]): PortalHealth {
  const failedMacs = new Set<string>();
  let formLogins = 0;
  let cookieLogins = 0;

  for (const m of messages) {
    // Doublon de trace (sens « ->: ») : même événement, déjà compté.
    if (m.startsWith("->:")) continue;
    if (/log in by http-(pap|chap)/.test(m)) formLogins++;
    else if (/log in by mac-cookie/.test(m)) cookieLogins++;
    else if (/login failed/.test(m)) {
      // Le nom d'utilisateur de l'essai MAC EST l'adresse MAC : c'est ce qui
      // distingue un nouvel appareil d'un ticket mal tapé.
      const mac = m.match(MAC)?.[0];
      if (mac) failedMacs.add(mac.toUpperCase());
    }
  }

  const newDevices = failedMacs.size;
  const verdict: PortalHealth["verdict"] =
    formLogins > 0 ? "ok" : newDevices >= PORTAL_MIN_NEW_DEVICES ? "suspect" : "unknown";

  return { newDevices, formLogins, cookieLogins, verdict };
}
