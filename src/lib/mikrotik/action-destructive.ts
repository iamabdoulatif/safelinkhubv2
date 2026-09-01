/**
 * Ce qu'une action destructive détruit, dit avant de la lancer.
 *
 * POURQUOI CE MODULE EXISTE. La confirmation tenait dans une CELLULE DE
 * TABLEAU : « Réinitialiser ce processus de configuration ? » suivi de deux
 * boutons de douze pixels. Or ces deux actions ne se ressemblent pas —
 * l'une retire une ligne de SafeLinkHub, l'autre envoie un
 * `/system/reset-configuration no-defaults` qui EFFACE LE ROUTEUR et le
 * redémarre. Le même libellé laconique pour les deux, dans un espace où rien
 * ne peut être expliqué, est exactement ce qui fait cliquer de travers.
 *
 * Les textes vivent ici, en données pures, pour être relus et testés sans
 * monter d'interface — ce sont eux qui portent la conséquence.
 */

export type ActionDestructive = "reset" | "delete";

export type Consequence = {
  /** Titre du dialogue. Nomme l'action, pas l'objet. */
  titre: string;
  /** Une phrase : ce qui se passe vraiment. */
  resume: string;
  /** Ce qui est détruit, point par point. */
  effets: string[];
  /** Ce qui SURVIT — rassure autant que la liste précédente informe. */
  conserve: string[];
  /** Libellé du bouton d'action. */
  bouton: string;
  /**
   * Vrai quand l'utilisateur doit RECOPIER le nom du routeur.
   * Réservé à l'effacement de l'appareil : c'est la seule action que rien ne
   * rattrape — ni sauvegarde SafeLinkHub, ni relance. Un clic de trop sur une
   * ligne voisine coûterait un déplacement sur site.
   */
  exigeLeNom: boolean;
};

export function consequenceDe(action: ActionDestructive, nomRouteur: string): Consequence {
  if (action === "reset") {
    return {
      titre: "Réinitialiser le routeur en configuration d'usine",
      resume: `Une commande d'effacement est envoyée à ${nomRouteur}, qui redémarre aussitôt.`,
      effets: [
        "Toute la configuration RouterOS est effacée : hotspot, bridges, WiFi, tunnel, conteneur MikHmon.",
        "Les tickets présents sur l'appareil disparaissent avec elle.",
        "Le routeur redevient joignable uniquement en local, sur son adresse d'usine.",
      ],
      conserve: [
        "Les ventes et transactions déjà enregistrées dans SafeLinkHub.",
        "Vos forfaits, agents et modèles de portail.",
      ],
      bouton: "Effacer le routeur",
      exigeLeNom: true,
    };
  }
  return {
    titre: "Retirer ce routeur de SafeLinkHub",
    resume: `${nomRouteur} est retiré de votre parc. L'appareil lui-même n'est pas touché.`,
    effets: [
      "La fiche, ses redirections d'accès distant et son tableau MikHmon sont retirés.",
      "Le tunnel est révoqué côté relais : l'appareil n'aura plus de chemin de retour.",
    ],
    conserve: [
      "La configuration reste EN PLACE sur le routeur — hotspot et tickets continuent de fonctionner sur site.",
      "Les ventes déjà enregistrées restent dans vos rapports.",
    ],
    bouton: "Retirer le routeur",
    exigeLeNom: false,
  };
}

/**
 * La saisie de confirmation correspond-elle au routeur ?
 *
 * Comparaison tolérante sur la casse et les espaces de bord uniquement : on
 * veut écarter la faute de frappe, pas transformer la confirmation en épreuve.
 */
export function nomConfirme(saisie: string, nomRouteur: string): boolean {
  return saisie.trim().toLowerCase() === nomRouteur.trim().toLowerCase();
}
