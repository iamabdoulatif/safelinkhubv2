// Langues servies par le site public.
//
// POURQUOI LA LANGUE EST DANS L'URL et non dans un cookie : lire un cookie
// pendant le rendu rend la page dynamique. La landing, le blog et les pages
// publiques sont aujourd'hui prérendus et mis en cache au bord par Cloudflare ;
// un cookie les ferait basculer en rendu à la demande à chaque visite. Deux
// URL, deux pages statiques, aucun coût.
//
// Le tableau de bord, lui, est déjà dynamique et derrière session : sa langue
// pourra venir d'une préférence utilisateur sans rien coûter.

export const LOCALES = ["fr", "en"] as const;
export type Locale = (typeof LOCALES)[number];

/** Le français reste servi à la racine : aucune URL existante ne bouge. */
export const DEFAULT_LOCALE: Locale = "fr";

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

/** Préfixe d'URL d'une langue — vide pour le français, « /en » pour l'anglais. */
export function localePrefix(locale: Locale): string {
  return locale === DEFAULT_LOCALE ? "" : `/${locale}`;
}

/**
 * Même page, autre langue. Sert au sélecteur : il doit renvoyer vers
 * l'équivalent de la page courante, pas vers l'accueil — un visiteur qui bascule
 * en anglais depuis /contact veut /en/contact.
 */
export function switchLocalePath(pathname: string, to: Locale): string {
  const sansPrefixe = pathname.replace(/^\/en(?=\/|$)/, "") || "/";
  const prefixe = localePrefix(to);
  // Vers le français : toujours sûr, c'est la langue de référence — toute page
  // y existe.
  if (!prefixe) return sansPrefixe;
  /* Vers l'anglais : on vérifie que la page existe. Sans ce garde-fou, le
     sélecteur fabriquait mécaniquement /en/<page> pour N'IMPORTE quelle page,
     y compris celles sans version anglaise — c'est ce qui renvoyait un 404
     depuis /contact et /blog. `localeHref` avait la vérification, le
     sélecteur ne l'avait pas : or c'est le seul contrôle dont le métier est
     précisément de changer de langue. À défaut, on renvoie vers l'accueil
     anglais plutôt que vers une URL morte. */
  if (!hasTranslation(sansPrefixe)) return "/en";
  return sansPrefixe === "/" ? "/en" : `${prefixe}${sansPrefixe}`;
}

/** Balise <html lang> correspondante. */
export const HTML_LANG: Record<Locale, string> = { fr: "fr", en: "en" };

/**
 * Routes qui EXISTENT en anglais. Tant qu'une page n'est pas traduite, un lien
 * vers `/en/...` renverrait un 404 : on garde donc la version française, qui
 * est au pire dans la mauvaise langue mais toujours accessible.
 *
 * On ajoute une entrée ici au moment où l'on publie la traduction — c'est le
 * seul endroit à tenir à jour, et l'oubli dégrade sans casser.
 */
const TRANSLATED_ROUTES = [
  "/",
  "/blog",
  "/contact",
  "/boutique",
  "/auth/login",
  "/auth/register",
  "/auth/activation",
  "/auth/activation-envoyee",
  "/auth/mot-de-passe-oublie",
  "/auth/reinitialiser",
] as const;

/**
 * Préfixes dont TOUTES les sous-pages existent en anglais. Les articles de blog
 * sont une route dynamique : les énumérer un par un est impossible, et sans
 * cette liste `localeHref` renvoyait chaque article du blog ANGLAIS vers sa
 * version française.
 */
const TRANSLATED_PREFIXES = ["/blog/"] as const;

/** Cette page existe-t-elle en anglais ? */
function hasTranslation(chemin: string): boolean {
  const p = chemin || "/";
  return (
    (TRANSLATED_ROUTES as readonly string[]).includes(p) ||
    TRANSLATED_PREFIXES.some((prefixe) => p.startsWith(prefixe))
  );
}

/** Lien interne dans la bonne langue, quand elle existe. */
export function localeHref(path: string, locale: Locale): string {
  if (locale === DEFAULT_LOCALE) return path;
  const [chemin] = path.split("#");
  const ancre = path.slice(chemin.length);
  if (!hasTranslation(chemin)) return path;
  return `${localePrefix(locale)}${chemin === "/" ? "" : chemin}${ancre}` || "/en";
}
