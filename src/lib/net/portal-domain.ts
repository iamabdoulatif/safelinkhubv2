/** Nom du hotspot → identifiants dérivés (SSID, domaine du portail). */

export function slugifyDomain(input: string) {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/** « NAMOIN-WIFI » → « NAMOIN WIFI » : le SSID s'affiche, il ne se tape pas. */
export function ssidFromHotspotName(name: string) {
  return name.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Domaines proposés pour le portail captif.
 *
 * Deux racines : le nom complet (« namoin-wifi ») et son premier mot
 * (« namoin »), chacune en .ci et .net — plus « 1.<racine>.ci », qu'un
 * téléphone atteint sans faute de frappe.
 */
export function portalDomainSuggestions(hotspotName: string): string[] {
  const full = slugifyDomain(hotspotName);
  if (!full) return [];
  const short = full.split("-")[0];
  const roots = short === full ? [full] : [short, full];
  return [
    ...(short ? [`1.${short}.ci`] : []),
    ...roots.map((r) => `${r}.ci`),
    ...roots.map((r) => `${r}.net`),
  ].filter((d, i, all) => all.indexOf(d) === i);
}
