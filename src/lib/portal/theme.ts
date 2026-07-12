export type PortalTheme = {
  accent: string;
  surface: string;
  text: string;
};

const DEFAULT_THEME: PortalTheme = {
  accent: "#0f766e",
  surface: "#ffffff",
  text: "#0f172a",
};

const HEX = /^#[0-9a-f]{6}$/i;

function themeColor(value: string | undefined, fallback: string) {
  return value && HEX.test(value) ? value.toLowerCase() : fallback;
}

export function portalThemeFromParams(input: Record<string, string | undefined>): PortalTheme {
  return {
    accent: themeColor(input.accent, DEFAULT_THEME.accent),
    surface: themeColor(input.surface, DEFAULT_THEME.surface),
    text: themeColor(input.text, DEFAULT_THEME.text),
  };
}

export function portalThemeFromUnknown(input: unknown): PortalTheme {
  const values = input && typeof input === "object" && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : {};

  return portalThemeFromParams({
    accent: typeof values.accent === "string" ? values.accent : undefined,
    surface: typeof values.surface === "string" ? values.surface : undefined,
    text: typeof values.text === "string" ? values.text : undefined,
  });
}

export function portalThemeSearch(theme: PortalTheme) {
  return new URLSearchParams(theme).toString();
}

export function appendPortalTheme(url: string, theme: PortalTheme) {
  const themedUrl = new URL(url);
  const safeTheme = portalThemeFromParams(theme);
  themedUrl.searchParams.set("accent", safeTheme.accent);
  themedUrl.searchParams.set("surface", safeTheme.surface);
  themedUrl.searchParams.set("text", safeTheme.text);
  return themedUrl.toString();
}
