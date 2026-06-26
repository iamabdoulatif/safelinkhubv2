import { readFileSync } from "fs";
import path from "path";

export type PackageFile = {
  path: string;
  content: string;
  encoding: "utf8" | "base64";
};

export type PackageVendor = {
  name: string;
  location: string;
  phone: string; // e.g. "+225 07 08 09 10 11" — digits are stripped for the wa.me link
};

export type PackageBrandingVars = {
  ssid: string;
  supportWhatsapp?: string | null; // e.g. "+225 00 00 00 00 00"
  supportPhone?: string | null;
  vendors?: PackageVendor[] | null;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const VENDOR_ICON_SVG = `<svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`;
const VENDOR_LOCATION_SVG = `<svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>`;
const WHATSAPP_SVG = `<svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>`;

function renderVendorsHtml(vendors: PackageVendor[] | null | undefined): string {
  if (!vendors || vendors.length === 0) return "";
  return vendors
    .map((v) => {
      const digits = v.phone.replace(/[^0-9]/g, "");
      return `          <div class="vendor-card">
            <div class="vendor-icon">${VENDOR_ICON_SVG}</div>
            <div class="vendor-info">
              <div class="vendor-name">${escapeHtml(v.name)}</div>
              <div class="vendor-location">${VENDOR_LOCATION_SVG}${escapeHtml(v.location)}</div>
              <div class="vendor-phone">${escapeHtml(v.phone)}</div>
            </div>
            <a href="https://wa.me/${digits}" target="_blank" class="vendor-action">${WHATSAPP_SVG}WhatsApp</a>
          </div>`;
    })
    .join("\n");
}

function renderSupportLinksHtml(supportWhatsapp?: string | null, supportPhone?: string | null): string {
  const links: string[] = [];
  if (supportWhatsapp) {
    const digits = supportWhatsapp.replace(/[^0-9]/g, "");
    links.push(
      `        <a href="https://wa.me/${digits}" target="_blank" class="support-link">${WHATSAPP_SVG}WhatsApp : ${escapeHtml(supportWhatsapp)}</a>`,
    );
  }
  if (supportPhone) {
    const digits = supportPhone.replace(/[^0-9]/g, "");
    links.push(
      `        <a href="tel:+${digits}" class="support-link">${WHATSAPP_SVG}Téléphone : ${escapeHtml(supportPhone)}</a>`,
    );
  }
  return links.join("\n");
}

const TEXT_EXTENSIONS = new Set([".html", ".css", ".js", ".svg"]);

// Listed explicitly (rather than walked at runtime) so Next.js's file
// tracer can see every path statically and bundle them into the deployed
// function — a dynamic directory walk over `packages/` would not be
// reliably included by the Vercel build.
const SAFELINKHUB_DEFAULT_FILES = [
  "login.html",
  "alogin.html",
  "rlogin.html",
  "redirect.html",
  "logout.html",
  "error.html",
  "status.html",
  "md5.js",
  "css/style.css",
  "js/app.js",
  "images/wifi.svg",
  "images/wave.png",
  "images/orange.png",
  "images/mtn-momo.png",
  "images/moov.png",
];

function loadPackage(dir: string, files: string[]): PackageFile[] {
  return files.map((relativePath) => {
    const ext = path.extname(relativePath);
    const isText = TEXT_EXTENSIONS.has(ext);
    const absolutePath = path.join(dir, relativePath);
    const content = isText
      ? readFileSync(absolutePath, "utf8")
      : readFileSync(absolutePath).toString("base64");
    return { path: relativePath, content, encoding: isText ? "utf8" : "base64" } as const;
  });
}

/** Reads the bundled SafeLinkHub default hotspot portal off disk, ready to store in `captiveTemplates.packageFiles`. */
export function loadSafelinkhubDefaultPackage(): PackageFile[] {
  const dir = path.join(process.cwd(), "src/lib/captive-templates/packages/safelinkhub-default");
  return loadPackage(dir, SAFELINKHUB_DEFAULT_FILES);
}

const EXT_TO_CONTENT_TYPE: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

export function contentTypeForPath(relativePath: string) {
  return EXT_TO_CONTENT_TYPE[path.extname(relativePath)] ?? "application/octet-stream";
}

/**
 * Substitutes the branding placeholders in a package file's rendered
 * content: {{SSID}} with the router's live WiFi SSID, and
 * {{VENDORS_HTML}} / {{SUPPORT_LINKS_HTML}} with markup generated from
 * the template's configurable support contact and vendor list.
 */
export function renderPackageFile(file: PackageFile, vars: PackageBrandingVars): Buffer {
  if (file.encoding === "base64") return Buffer.from(file.content, "base64");
  const rendered = file.content
    .replaceAll("{{SSID}}", vars.ssid)
    .replaceAll("{{VENDORS_HTML}}", renderVendorsHtml(vars.vendors))
    .replaceAll("{{SUPPORT_LINKS_HTML}}", renderSupportLinksHtml(vars.supportWhatsapp, vars.supportPhone));
  return Buffer.from(rendered, "utf8");
}
