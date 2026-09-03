/**
 * Une ligne lisible à partir des champs d'adresse d'un routeur.
 *
 * Les quatre champs sont indépendants et souvent partiels : le géocodage
 * inverse rend parfois le quartier sans la rue, et un opérateur peut n'avoir
 * saisi que la commune. On assemble donc ce qui existe, sans jamais produire
 * une suite de séparateurs sur des champs vides.
 */
export type RouterLocationFields = {
  locationStreet?: string | null;
  locationNeighbourhood?: string | null;
  locationCommune?: string | null;
  locationCountry?: string | null;
};

export function routerLocationLabel(router: RouterLocationFields): string {
  return [
    router.locationStreet,
    router.locationNeighbourhood,
    router.locationCommune,
    router.locationCountry,
  ]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(" · ");
}
