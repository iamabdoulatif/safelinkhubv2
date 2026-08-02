/**
 * Fragment RouterOS ajouté au `on-login` du profil roaming : à chaque connexion
 * d'un code, le routeur signale au SaaS le couple (code, MAC) vu, pour que le
 * SaaS lie ce MAC au ticket sur les zones sœurs (auto-login inter-zones).
 *
 * Contraintes respectées :
 *  • Non bloquant pour le login : enveloppé dans `:do {…} on-error={}` — un SaaS
 *    injoignable ou un échec fetch n'empêche jamais l'utilisateur de se connecter
 *    (le on-login MikHmon existant fait déjà des :delay, la tolérance est là).
 *  • `check-certificate=no` : le magasin de CA de RouterOS ne connaît pas
 *    forcément la chaîne Cloudflare → sans ça le fetch échouerait en silence. La
 *    donnée n'est qu'un « MAC vu » re-vérifié côté serveur, l'enjeu de confiance
 *    est nul.
 *  • Concaténation hors chaîne pour les variables (`$user`, `$"mac-address"`) :
 *    évite toute ambiguïté de guillemets dans le script.
 */

/** Chemin du webhook — sert aussi de marqueur d'idempotence dans le on-login. */
export const ROAM_HOOK_MARKER = "/api/roaming/seen";

/** Le fragment `/tool fetch` à exécuter en fin de on-login. */
export function roamingSeenFetch(appUrl: string, routerId: string, key: string): string {
  const url = `${appUrl.replace(/\/+$/, "")}${ROAM_HOOK_MARKER}`;
  return (
    `:do { /tool fetch url="${url}" mode=https check-certificate=no http-method=post ` +
    `http-header-field="Content-Type: application/x-www-form-urlencoded" ` +
    `http-data=("r=${routerId}&k=${key}&u=" . $user . "&m=" . $"mac-address") ` +
    `keep-result=no } on-error={}`
  );
}

/**
 * Ajoute le hook au on-login s'il n'y est pas déjà (idempotent). Ne réécrit
 * jamais le script existant : on APPEND, comme le fait ensureHotspotLoginByCode
 * pour login-by. Le on-login roaming de base ne contient jamais le marqueur, la
 * ré-application au provisioning produit donc toujours la même chaîne.
 */
export function appendRoamingSeenHook(
  onLogin: string,
  appUrl: string,
  routerId: string,
  key: string,
): string {
  if (onLogin.includes(ROAM_HOOK_MARKER)) return onLogin;
  return `${onLogin} ${roamingSeenFetch(appUrl, routerId, key)}`;
}
