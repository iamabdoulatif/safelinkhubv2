/** Bouton d'action d'une carte de solde. Les deux portefeuilles (FCFA et
 *  Safecoin) vivent dans des fichiers différents : sans constante partagée,
 *  leurs boutons divergeaient à la première retouche — et deux boutons qui
 *  font la même chose doivent se ressembler. */
export const BOUTON_SOLDE =
  "inline-flex items-center gap-2 rounded-full border border-line bg-brand px-4 py-2.5 text-sm font-bold text-slate-deep transition-colors hover:bg-ink hover:text-paper";
