// Indice de session LISIBLE PAR LE NAVIGATEUR (non httpOnly), posé à côté du
// vrai cookie de session (lui httpOnly). Il ne contient AUCUN secret : juste
// « 1 ». Il sert à la landing (nav, bandeau) à connaître l'état connecté DÈS
// le premier rendu, sans flash « Connexion »/« Commencer » avant que
// /api/session réponde. La source de vérité reste le cookie httpOnly côté
// serveur ; cet indice n'autorise rien.
export const AUTH_HINT_COOKIE_NAME = "safelinkhub_authed";

/** Lecture synchrone côté client (false au rendu serveur). */
export function readAuthHint(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie.split("; ").some((c) => c === `${AUTH_HINT_COOKIE_NAME}=1`);
}
