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

/**
 * Déduplique les zones proposées à l'ajout et écarte celles qui couvrent déjà
 * le groupe. La suppression d'une zone est volontairement un autre parcours :
 * retirer les tickets qui y vivent est une opération de révocation, pas une
 * simple modification de case à cocher.
 */
export function newRoamingRouterIds(currentRouterIds: string[], requestedRouterIds: string[]) {
  const current = new Set(currentRouterIds);
  const added = new Set<string>();
  for (const routerId of requestedRouterIds) {
    const id = routerId.trim();
    if (id && !current.has(id)) added.add(id);
  }
  return [...added];
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
 * Identifiant d'un compte nominatif (« aroune », « latif@ », « karl- »), par
 * opposition à un code tiré au hasard.
 *
 * Le jeu autorisé est étroit pour une raison PRÉCISE : à chaque connexion, le
 * on-login du profil renvoie l'identifiant au SaaS dans un corps
 * `application/x-www-form-urlencoded` (« …&u=" . $user »), sans encodage. Un
 * « & », un « = », un « + » ou un « % » y couperait le champ ou injecterait le
 * suivant. L'arobase, le point, le tiret et le souligné, eux, y transitent sans
 * dommage — d'où leur présence ici.
 *
 * (Le nom n'est PAS recopié littéralement dans le script RouterOS : celui-ci
 * utilise la variable $user. Le risque n'est donc pas le guillemet, c'est le
 * séparateur de formulaire.)
 */
/**
 * Le jeu de caractères, sous sa forme `pattern` HTML.
 *
 * Exporté pour que les champs du navigateur et la validation du serveur ne
 * puissent PAS diverger : le formulaire de création portait un motif sans
 * arobase alors que le serveur l'acceptait et que le formulaire de
 * modification l'autorisait — « latif@ » était donc refusé à la création, par
 * le navigateur, sans que rien n'atteigne jamais le serveur.
 */
export const ROAMING_USERNAME_PATTERN = "[A-Za-z0-9._@-]{2,32}";

export function isValidRoamingUsername(raw: string) {
  return new RegExp(`^${ROAMING_USERNAME_PATTERN}$`).test(raw);
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
