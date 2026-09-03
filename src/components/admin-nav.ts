/** Quel groupe de la barre latérale est déplié.
 *
 * Par défaut celui de la page courante — une barre entièrement close ne dirait
 * plus où l'on se trouve. Le pli choisi à la main l'emporte, mais seulement
 * TANT QU'ON RESTE sur la même page : dès qu'on navigue, c'est de nouveau la
 * position réelle qui commande, sinon on garderait ouvert un groupe qu'on a
 * quitté pendant que celui où l'on travaille resterait fermé.
 */
export function groupeOuvert<G extends string>({
  groupeActif,
  choix,
  chemin,
}: {
  /** Groupe contenant la page courante, null si aucune (tableau de bord). */
  groupeActif: G | null;
  /** Dernier pli demandé par l'opérateur, avec la page où il l'a demandé. */
  choix: { chemin: string; groupe: G | null } | null;
  chemin: string | null;
}): G | null {
  return choix && choix.chemin === chemin ? choix.groupe : groupeActif;
}
