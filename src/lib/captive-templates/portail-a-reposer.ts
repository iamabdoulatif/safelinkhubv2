/**
 * Quel portail captif reposer sur un routeur donné.
 *
 * POURQUOI CE CHOIX EST DÉLICAT. Les fichiers du portail sont écrits dans la
 * flash du routeur, et les prix y sont figés au moment du téléchargement.
 * Corriger un tarif dans Forfaits ne redescend donc JAMAIS tout seul : il faut
 * reposer les fichiers. Se tromper de modèle ne donne pas une erreur — cela
 * remplace silencieusement le portail d'une zone par celui d'une autre, avec
 * une autre marque et d'autres forfaits, et personne ne s'en aperçoit avant
 * qu'un client se plaigne.
 *
 * D'où la règle, volontairement stricte : on repose CE QUE LE ROUTEUR PORTE
 * DÉJÀ, et à défaut le modèle par défaut de l'organisation. Jamais « le
 * premier de la liste ».
 */

export type ModeleCandidat = {
  id: string;
  name: string;
  isDefault: boolean;
  templateType: string;
};

export type VerdictPortail =
  | { ok: true; templateId: string; nom: string; origine: "routeur" | "defaut-org" }
  | { ok: false; erreur: string };

/** Les portails multi-fichiers sont les seuls installables sur un routeur. */
export function estInstallable(m: ModeleCandidat): boolean {
  return m.templateType === "package";
}

export function portailAReposer(
  templateIdDuRouteur: string | null | undefined,
  modeles: readonly ModeleCandidat[],
): VerdictPortail {
  const installables = modeles.filter(estInstallable);

  if (templateIdDuRouteur) {
    const assigne = installables.find((m) => m.id === templateIdDuRouteur);
    if (assigne) {
      return { ok: true, templateId: assigne.id, nom: assigne.name, origine: "routeur" };
    }
    /* Le routeur pointe un modèle supprimé, ou devenu non installable. On
       REFUSE plutôt que de retomber sur le défaut : l'exploitant croirait
       reposer le portail de cette zone et en installerait un autre. */
    return {
      ok: false,
      erreur:
        "Le portail assigné à ce routeur n'existe plus. Choisissez-en un dans Réglages → Portails captifs.",
    };
  }

  const defaut = installables.find((m) => m.isDefault);
  if (defaut) {
    return { ok: true, templateId: defaut.id, nom: defaut.name, origine: "defaut-org" };
  }

  return {
    ok: false,
    erreur: "Aucun portail par défaut n'est défini. Choisissez-en un dans Réglages → Portails captifs.",
  };
}
