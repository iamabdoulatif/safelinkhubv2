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

export function portalThemeSearch(theme: PortalTheme) {
  return new URLSearchParams(theme).toString();
}
