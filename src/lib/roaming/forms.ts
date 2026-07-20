export function roamingGroupCode(name: string) {
  const code = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return code || "ROAMING";
}

/** Empty means inherit catalogue price; undefined means malformed input. */
export function parseRoamingPriceOverride(raw: string): number | null | undefined {
  const normalized = raw.replace(/\s/g, "").trim();
  if (!normalized) return null;
  if (!/^\d+$/.test(normalized)) return undefined;
  const value = Number(normalized);
  return Number.isSafeInteger(value) ? value : undefined;
}

/**
 * RouterOS profiles carry the price and rate-limit script. Names must therefore
 * be unique per roaming group, even when two groups both sell "01-JOUR" on a
 * shared router. The UUID fragment keeps it stable and collision-resistant
 * without leaking an operator-facing group name into RouterOS.
 */
export function roamingRouterProfileName(groupId: string, baseProfileName: string) {
  const groupKey = groupId.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 12);
  return `ROAM-${groupKey || "GROUP"}-${baseProfileName}`.slice(0, 63);
}
