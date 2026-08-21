import "server-only";
import { cookies } from "next/headers";
import { DEFAULT_LOCALE, isLocale, type Locale } from "./config";

/* Langue des zones AUTHENTIFIÉES (le tableau de bord).
 *
 * Le site public met la langue dans l'URL : /contact et /boutique sont
 * prérendus, et lire un cookie les basculerait en rendu à la demande à chaque
 * visite. Le tableau de bord n'a pas ce problème — il est déjà dynamique,
 * derrière session — et il compte 38 pages : les dupliquer sous /en/admin
 * reviendrait à maintenir 157 fichiers en double. D'où un cookie ici, une URL
 * là-bas ; les deux mécanismes servent le même dictionnaire.
 *
 * Le cookie n'est PAS httpOnly : il ne porte aucun secret, et le laisser
 * lisible permettra plus tard à un composant client de le relire sans aller-
 * retour serveur. */
export const LOCALE_COOKIE = "slh_lang";
const UN_AN = 60 * 60 * 24 * 365;

export const LOCALE_COOKIE_OPTIONS = {
  path: "/",
  maxAge: UN_AN,
  sameSite: "lax",
  httpOnly: false,
} as const;

/** Langue choisie par l'utilisateur connecté, français par défaut. */
export async function getLocale(): Promise<Locale> {
  const valeur = (await cookies()).get(LOCALE_COOKIE)?.value;
  return valeur && isLocale(valeur) ? valeur : DEFAULT_LOCALE;
}
