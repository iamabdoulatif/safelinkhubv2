import { Wifi } from "lucide-react";
import type { PackageFile } from "@/lib/captive-templates/package-files";

function extractCssVar(css: string, name: string, fallback: string): string {
  const match = css.match(new RegExp(`--${name}\\s*:\\s*([^;]+);`));
  return match ? match[1].trim() : fallback;
}

/**
 * "Package" templates are static multi-file HTML/CSS bundles, not the
 * logo/colors/text fields CaptivePreview renders for parametric templates
 * — there's no single source of truth to plug into that component. This
 * instead reads the actual --primary/--bg-body/etc. CSS custom properties
 * out of the bundled css/style.css, so the card shows the template's real
 * color scheme instead of a generic gray "multi-file" placeholder.
 */
export default function PackagePreview({ files }: { files: unknown }) {
  const list = Array.isArray(files) ? (files as PackageFile[]) : [];
  const css = list.find((f) => f.path === "css/style.css");
  const cssText = css?.encoding === "utf8" ? css.content : "";

  const primary = extractCssVar(cssText, "primary", "#10b981");
  const bgBody = extractCssVar(cssText, "bg-body", "#f0fdf4");
  const bgCard = extractCssVar(cssText, "bg-card", "#ffffff");
  const textPrimary = extractCssVar(cssText, "text-primary", "#0f172a");
  const textSecondary = extractCssVar(cssText, "text-secondary", "#64748b");

  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center gap-3 p-6"
      style={{ backgroundColor: bgBody }}
    >
      <div
        className="flex w-full max-w-[220px] flex-col items-center gap-3 rounded-xl p-5 shadow-sm"
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
