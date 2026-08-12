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

/**
 * Identifiant d'un compte nominatif (« aroune »), par opposition à un code
 * tiré au hasard.
 *
 * Volontairement étroit : MikHmon et les scripts RouterOS manipulent ces noms
 * sans guillemets, et le on-login du profil les recopie dans des commandes.
 * Un espace, une apostrophe ou un accent y produit des surprises — mieux vaut
 * refuser à la saisie que découvrir le problème sur un routeur en clientèle.
 */
export function isValidRoamingUsername(raw: string) {
  return /^[A-Za-z0-9._-]{2,32}$/.test(raw);
}

/**
 * Mot de passe d'un compte nominatif. Vide = on reprend l'identifiant, usage
 * courant sur les MikroTik (« aroune / aroune ») ; cela évite surtout un compte
 * sans mot de passe, qu'un `=password=` vide créerait sans broncher.
 */
export function roamingUserPassword(rawPassword: string, username: string) {
  const password = rawPassword.trim() || username;
  return password.length >= 2 && password.length <= 64 ? password : null;
}
