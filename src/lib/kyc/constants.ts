/* Constantes du parcours KYC.
 *
 * Fichier SÉPARÉ des actions à dessein : un module « use server » ne peut
 * exporter que des fonctions asynchrones. Y laisser une constante ne produit
 * aucune erreur de typage — le bundler, lui, la retire, et TOUS les imports du
 * module échouent alors, y compris ceux des actions. C'est ce qui a cassé le
 * build. */
export const MAX_KYC_ATTEMPTS = 3;
