/** Returns the selling price for a group offer without losing a zero override. */
export function effectiveRoamingPrice(
  cataloguePriceCents: number,
  priceOverrideCents: number | null,
) {
  return priceOverrideCents ?? cataloguePriceCents;
}

export function roamingPriceSource(priceOverrideCents: number | null) {
  return priceOverrideCents === null ? "catalogue" : "groupe";
}
