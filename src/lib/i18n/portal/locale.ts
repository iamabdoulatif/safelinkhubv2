import { DEFAULT_LOCALE, isLocale, type Locale } from "../config";

/**
 * Hosted portals do not have an authenticated dashboard cookie. Their language
 * is therefore an explicit URL parameter carried across every payment redirect.
 */
export function portalLocale(value: string | undefined): Locale {
  return value && isLocale(value) ? value : DEFAULT_LOCALE;
}

/** Adds or replaces the validated portal language without dropping query data. */
export function withPortalLocale(path: string, locale: Locale): string {
  const url = new URL(path, "https://portal.invalid");
  url.searchParams.set("lang", locale);
  return `${url.pathname}${url.search}${url.hash}`;
}
