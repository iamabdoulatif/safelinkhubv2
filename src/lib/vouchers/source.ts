/** Origine des tickets importés depuis un export MikHmon/CSV. */
export const IMPORTED_USE_CASE_PREFIX = "imported";

/**
 * Retourne vrai uniquement pour les tickets adoptés depuis le MikroTik.
 * Les libellés historiques sont « Imported » et « Imported CSV » ; la
 * comparaison insensible à la casse protège les anciennes lignes.
 */
export function isImportedVoucherUseCase(useCase: string | null | undefined) {
  return useCase?.trim().toLowerCase().startsWith(IMPORTED_USE_CASE_PREFIX) ?? false;
}
