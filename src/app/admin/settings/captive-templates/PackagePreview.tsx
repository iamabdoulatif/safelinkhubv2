import { Wifi } from "lucide-react";
import type { PackageFile } from "@/lib/captive-templates/package-files";

// Tries each candidate var name in order — different package templates
// name their CSS custom properties differently (the bundled SafeLinkHub
// template uses --bg-body/--bg-card/--text-primary/--text-secondary; the
// SafeLink Africa one uses --bg/--card/--text/--text-muted) — and returns
// the fallback only once every candidate has come up empty.
function extractCssVar(css: string, names: string[], fallback: string): string {
  for (const name of names) {
    const match = css.match(new RegExp(`--${name}\\s*:\\s*([^;]+);`));
    if (match) return match[1].trim();
  }
  return fallback;
}

/**
 * "Package" templates are static multi-file HTML/CSS bundles, not the
 * logo/colors/text fields CaptivePreview renders for parametric templates
 * — there's no single source of truth to plug into that component. This
 * instead reads the actual --primary/--bg-body/etc. CSS custom properties
 * out of the bundled stylesheet, so the card shows the template's real
 * color scheme instead of a generic gray "multi-file" placeholder.
 *
 * The stylesheet itself isn't at a fixed path either — every "package"
 * hardcoded to css/style.css (singular) silently found nothing for a
 * template whose stylesheet is at css/styles.css (plural), so every such
 * template fell back to the exact same defaults and looked identical to
 * each other in the card grid. Picks whichever .css file actually defines
 * a --primary custom property instead of assuming one literal path or
 * just the first .css in the list — a bundle can ship several (vendor
 * bundles like FontAwesome or a compiled Tailwind file included before
 * the theme stylesheet in its own file list) that define no custom
 * properties at all and would otherwise win by file order.
 */
export default function PackagePreview({ files }: { files: unknown }) {
  const list = Array.isArray(files) ? (files as PackageFile[]) : [];
  const cssFiles = list.filter((f) => f.path.endsWith(".css") && f.encoding === "utf8");
  const css = cssFiles.find((f) => /--primary\s*:/.test(f.content)) ?? cssFiles[0];
  const cssText = css?.content ?? "";

  const primary = extractCssVar(cssText, ["primary"], "#10b981");
  const bgBody = extractCssVar(cssText, ["bg-body", "bg"], "#f0fdf4");
  const bgCard = extractCssVar(cssText, ["bg-card", "card"], "#ffffff");
  const textPrimary = extractCssVar(cssText, ["text-primary", "text"], "#0f172a");
  const textSecondary = extractCssVar(cssText, ["text-secondary", "text-muted"], "#64748b");

  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center gap-3 p-6"
      style={{ backgroundColor: bgBody }}
    >
      <div
        className="flex w-full max-w-[220px] flex-col items-center gap-3 rounded-xl p-5"
        style={{ backgroundColor: bgCard }}
      >
        <span
          className="flex h-9 w-9 items-center justify-center rounded-full text-white"
          style={{ backgroundColor: primary }}
        >
          <Wifi className="h-4.5 w-4.5" />
        </span>
        <div className="h-2.5 w-3/4 rounded-full" style={{ backgroundColor: textPrimary, opacity: 0.85 }} />
        <div className="h-2 w-1/2 rounded-full" style={{ backgroundColor: textSecondary, opacity: 0.5 }} />
        <div className="h-7 w-full rounded-md" style={{ backgroundColor: bgBody }} />
        <div className="h-7 w-full rounded-md" style={{ backgroundColor: primary }} />
      </div>
    </div>
  );
}
