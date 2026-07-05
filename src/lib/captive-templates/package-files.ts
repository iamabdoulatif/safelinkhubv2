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

// Forfait actif de l'org (table packages) injecté dans les placeholders
// {{PLANS_HTML}} / {{PLANS_JSON}} / {{MIN_PLAN_PRICE}} au moment où le
// routeur télécharge les fichiers — les prix affichés sur le portail
// suivent donc automatiquement la page Forfaits, sans réédition du HTML.
export type PortalPlan = {
  name: string; // technical voucher-profile name, e.g. "3j"
  priceCents: number; // stored as whole FCFA units across the app
  durationValue: number;
  durationUnit: string; // "Minutes" | "Hours" | "Days" | "Weeks" | "Months"
};

export type PackageBrandingVars = {
  ssid: string;
  supportWhatsapp?: string | null; // e.g. "+225 00 00 00 00 00"
  supportPhone?: string | null;
  vendors?: PackageVendor[] | null;
  plans?: PortalPlan[] | null;
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

const DURATION_UNIT_LABELS: Record<string, { singular: string; plural: string; short: string }> = {
  Minutes: { singular: "Minute", plural: "Minutes", short: "min" },
  Hours: { singular: "Heure", plural: "Heures", short: "h" },
  Days: { singular: "Jour", plural: "Jours", short: "j" },
  Weeks: { singular: "Semaine", plural: "Semaines", short: "sem" },
  Months: { singular: "Mois", plural: "Mois", short: "mois" },
};

function planDisplayName(plan: PortalPlan): string {
  const unit = DURATION_UNIT_LABELS[plan.durationUnit];
  if (!unit) return plan.name;
  const label = plan.durationValue > 1 ? unit.plural : unit.singular;
  return `${String(plan.durationValue).padStart(2, "0")} ${label}`;
}

function formatFcfa(amount: number): string {
  return `${amount.toLocaleString("fr-FR")} FCFA`;
}

// Card markup matching the plan-card/plan-info/plan-name/plan-details/
// plan-price/plan-btn CSS-class family of the bundled SafeLinkHub portal
// and the operator-made ones derived from it — the import-time
// auto-parameterization (see autoParameterizePortalFiles) swaps a
// portal's hardcoded `plans-grid` cards for {{PLANS_HTML}}, so the
// portal's own stylesheet keeps styling these. The `.plan-btn` carries
// both the human `data-price` ("200 FCFA", used by the portal's own JS
// toast) and a machine-readable `data-price-cents` for any payment flow
// that needs the raw amount; `data-plan` holds the display label.
function renderPlansHtml(plans: PortalPlan[] | null | undefined): string {
  if (!plans || plans.length === 0) return "";
  return plans
    .map((plan) => {
      const label = escapeHtml(planDisplayName(plan));
      const priceLabel = escapeHtml(formatFcfa(plan.priceCents));
      return `          <div class="plan-card">
            <div class="plan-info">
              <span class="plan-name">${label}</span>
              <span class="plan-details">Illimité</span>
            </div>
            <span class="plan-price">${priceLabel}</span>
            <button class="plan-btn" data-plan="${label}" data-price="${priceLabel}" data-price-cents="${plan.priceCents}">Acheter</button>
          </div>`;
    })
    .join("\n");
}

// Bundled "SafeLink Africa" (Yahya) portal renders forfaits with a
// different card family — `.price-card` / `.price-duration-badge` /
// `.price-info` / `.btn-pay` / `.price-amount` — and its own mobile-money
// purchase flow (`openPhoneModal('<planName>')` → POST /api/payments/
// initiate with `planName`). So it gets its own {{PRICE_CARDS_HTML}}
// placeholder rather than reusing {{PLANS_HTML}} (whose markup matches
// the SafeLinkHub card family instead). The colour of the duration badge
// has no default background in the stylesheet, so each card is assigned
// one of the defined `badge-*` colour classes in rotation.
const YAHYA_BADGE_CLASSES = [
  "badge-10h",
  "badge-5j",
  "badge-1sem",
  "badge-2sem",
  "badge-1mois",
  "badge-1j",
  "badge-3h",
];

/**
 * Escapes a value for safe use inside `onclick="openPhoneModal('<here>')"`:
 * the JS string is single-quoted (so backslashes and single quotes are
 * JS-escaped) and the HTML attribute is double-quoted (so the result is
 * then HTML-escaped, turning any `"` into `&quot;`).
 */
function escapeForOnclickArg(value: string): string {
  return escapeHtml(value.replace(/\\/g, "\\\\").replace(/'/g, "\\'"));
}

function renderPriceCardsHtml(plans: PortalPlan[] | null | undefined): string {
  if (!plans || plans.length === 0) return "";
  return plans
    .map((plan, index) => {
      const unit = DURATION_UNIT_LABELS[plan.durationUnit];
      const unitWord = unit
        ? (plan.durationValue > 1 ? unit.plural : unit.singular).toLowerCase()
        : "";
      const badge = YAHYA_BADGE_CLASSES[index % YAHYA_BADGE_CLASSES.length];
      const title = escapeHtml(`Forfait ${planDisplayName(plan)}`);
      const num = escapeHtml(String(plan.durationValue));
      const unitHtml = escapeHtml(unitWord);
      const details = escapeHtml(
        unitWord ? `${plan.durationValue} ${unitWord} de connexion illimitée` : "Connexion illimitée",
      );
      const priceLabel = escapeHtml(`${plan.priceCents.toLocaleString("fr-FR")} F`);
      const onclickArg = escapeForOnclickArg(plan.name);
      return `    <div class="price-card">
      <div class="price-left">
        <div class="price-duration-badge ${badge}">
          <span class="num">${num}</span>
          <span class="unit">${unitHtml}</span>
        </div>
        <div class="price-info">
          <h3>${title}</h3>
          <p><i class="fas fa-check-circle"></i> ${details}</p>
        </div>
      </div>
      <button onclick="openPhoneModal('${onclickArg}')" class="btn-pay">
        <i class="fas fa-cart-shopping"></i>
        <span class="price-amount">${priceLabel}</span>
      </button>
    </div>`;
    })
    .join("\n");
}

function renderPlansJson(plans: PortalPlan[] | null | undefined): string {
  return JSON.stringify(
    (plans ?? []).map((plan) => ({
      name: plan.name,
      label: planDisplayName(plan),
      price: plan.priceCents,
      priceLabel: formatFcfa(plan.priceCents),
      durationValue: plan.durationValue,
      durationUnit: plan.durationUnit,
    })),
  );
}

function minPlanPriceLabel(plans: PortalPlan[] | null | undefined): string {
  if (!plans || plans.length === 0) return "";
  return formatFcfa(Math.min(...plans.map((p) => p.priceCents)));
}

const TEXT_EXTENSIONS = new Set([".html", ".css", ".js", ".svg", ".txt"]);

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

// Second bundled portal option — mobile-money / voucher / QR-code login
// flow with its own design, kept alongside the SafeLinkHub default so
// admins can pick whichever one fits their hotspot. Trimmed down from the
// original source: dropped npm/build tooling (package.json,
// package-lock.json, tailwind.config.js, tailwind.input.css — already
// compiled into css/tailwind.css), the unreferenced qrcode.php (RouterOS
// has no PHP runtime, and login.html actually loads the QR scanner from
// the html5-qrcode CDN instead), and css/fontawesome.min.css (an unused
// duplicate of css/all.min.css, which is what the pages actually link).
const YAHYA_WIFI_FILES = [
  "login.html",
  "alogin.html",
  "rlogin.html",
  "redirect.html",
  "logout.html",
  "error.html",
  "status.html",
  "success.html",
  "radvert.html",
  "config.js",
  "errors.txt",
  "errors-en.txt",
  "css/all.min.css",
  "css/styles.css",
  "css/tailwind.css",
  "css/webfonts/fa-brands-400.woff2",
  "css/webfonts/fa-regular-400.woff2",
  "css/webfonts/fa-solid-900.woff2",
  "css/webfonts/fa-v4compatibility.woff2",
  "img/630692965_26241941825431688_2766478302372875865_n.jpg",
  "img/wifi_def.avif",
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

/** Reads the bundled "Yahya WiFi" hotspot portal off disk, ready to store in `captiveTemplates.packageFiles`. */
export function loadYahyaWifiPackage(): PackageFile[] {
  const dir = path.join(process.cwd(), "src/lib/captive-templates/packages/yahya-wifi");
  return loadPackage(dir, YAHYA_WIFI_FILES);
}

const EXT_TO_CONTENT_TYPE: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".avif": "image/avif",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

// Everything a portal folder may legitimately contain — the import action
// rejects anything else (executables, archives, dotfiles) outright.
export const PORTAL_ALLOWED_EXTENSIONS = new Set(Object.keys(EXT_TO_CONTENT_TYPE));
export const PORTAL_TEXT_EXTENSIONS = TEXT_EXTENSIONS;

export function contentTypeForPath(relativePath: string) {
  return EXT_TO_CONTENT_TYPE[path.extname(relativePath)] ?? "application/octet-stream";
}

/**
 * Substitutes the branding placeholders in a package file's rendered
 * content: {{SSID}} with the router's live WiFi SSID, {{VENDORS_HTML}} /
 * {{SUPPORT_LINKS_HTML}} with markup generated from the template's
 * configurable support contact and vendor list, {{PLANS_HTML}} /
 * {{PRICE_CARDS_HTML}} / {{PLANS_JSON}} / {{MIN_PLAN_PRICE}} with the
 * org's live Forfaits ({{PLANS_HTML}} for the SafeLinkHub card family,
 * {{PRICE_CARDS_HTML}} for the SafeLink Africa / Yahya one), and
 * {{SUPPORT_PHONE}} / {{SUPPORT_PHONE_TEL}} / {{SUPPORT_WHATSAPP}} with
 * the template's support contact.
 */
export function renderPackageFile(file: PackageFile, vars: PackageBrandingVars): Buffer {
  if (file.encoding === "base64") return Buffer.from(file.content, "base64");
  const supportPhoneDigits = (vars.supportPhone ?? "").replace(/[^0-9]/g, "");
  const rendered = file.content
    .replaceAll("{{SSID}}", vars.ssid)
    .replaceAll("{{VENDORS_HTML}}", renderVendorsHtml(vars.vendors))
    .replaceAll("{{SUPPORT_LINKS_HTML}}", renderSupportLinksHtml(vars.supportWhatsapp, vars.supportPhone))
    .replaceAll("{{PLANS_HTML}}", renderPlansHtml(vars.plans))
    .replaceAll("{{PRICE_CARDS_HTML}}", renderPriceCardsHtml(vars.plans))
    .replaceAll("{{PLANS_JSON}}", renderPlansJson(vars.plans))
    .replaceAll("{{MIN_PLAN_PRICE}}", minPlanPriceLabel(vars.plans))
    .replaceAll("{{SUPPORT_PHONE}}", vars.supportPhone ?? "")
    .replaceAll("{{SUPPORT_PHONE_TEL}}", supportPhoneDigits ? `tel:+${supportPhoneDigits}` : "#")
    .replaceAll("{{SUPPORT_WHATSAPP}}", vars.supportWhatsapp ?? "");
  return Buffer.from(rendered, "utf8");
}

/**
 * Replaces the inner content of the first `<div class="...${className}...">`
 * with `replacement`, matching the closing tag by depth so nested divs
 * inside the block don't truncate it. Returns null when no such div exists.
 */
function replaceDivContents(html: string, className: string, replacement: string): string | null {
  const openTag = new RegExp(`<div[^>]*class="[^"]*\\b${className}\\b[^"]*"[^>]*>`, "i").exec(html);
  if (!openTag) return null;
  const start = openTag.index + openTag[0].length;
  const tagRe = /<div\b[^>]*>|<\/div>/gi;
  tagRe.lastIndex = start;
  let depth = 1;
  let match: RegExpExecArray | null;
  while ((match = tagRe.exec(html))) {
    depth += match[0].startsWith("</") ? -1 : 1;
    if (depth === 0) {
      return html.slice(0, start) + replacement + html.slice(match.index);
    }
  }
  return null;
}

/**
 * Import-time auto-parameterization of an operator-uploaded portal, so a
 * portal exported from a working hotspot (hardcoded SSID/prices/phone)
 * becomes dynamic without hand-editing its HTML:
 *
 * - `$(hostname)` (RouterOS's own identity variable, e.g. "HSPT-X") →
 *   {{SSID}}, so the portal shows the customer-facing WiFi name instead;
 * - a hardcoded `plans-grid` of `plan-card`s → {{PLANS_HTML}}, rendered
 *   from the org's live Forfaits at install time;
 * - a hardcoded `promo-banner-price` → {{MIN_PLAN_PRICE}};
 * - hardcoded `href="tel:..."` links → {{SUPPORT_PHONE_TEL}}, wired to
 *   the template's configurable support phone (Coordonnées editor).
 *
 * Files that already carry {{...}} placeholders are left as-is for that
 * placeholder — an author who placed them deliberately wins over the
 * heuristics. Non-HTML and binary files pass through untouched.
 */
export function autoParameterizePortalFiles(files: PackageFile[]): {
  files: PackageFile[];
  substitutions: string[];
} {
  const substitutions = new Set<string>();
  const transformed = files.map((file) => {
    if (file.encoding !== "utf8" || !file.path.endsWith(".html")) return file;
    let content = file.content;

    if (content.includes("$(hostname)")) {
      content = content.replaceAll("$(hostname)", "{{SSID}}");
      substitutions.add("$(hostname) → {{SSID}}");
    }

    if (!content.includes("{{PLANS_HTML}}") && content.includes("plan-card")) {
      const replaced = replaceDivContents(content, "plans-grid", "\n{{PLANS_HTML}}\n      ");
      if (replaced) {
        content = replaced;
        substitutions.add("forfaits codés en dur → {{PLANS_HTML}} (synchronisés avec la page Forfaits)");
      }
    }

    if (!content.includes("{{MIN_PLAN_PRICE}}")) {
      const withPromo = content.replace(
        /(<span[^>]*class="[^"]*\bpromo-banner-price\b[^"]*"[^>]*>)[\s\S]*?(<\/span>)/i,
        "$1{{MIN_PLAN_PRICE}}$2",
      );
      if (withPromo !== content) {
        content = withPromo;
        substitutions.add("prix promo codé en dur → {{MIN_PLAN_PRICE}}");
      }
    }

    if (!content.includes("{{SUPPORT_PHONE_TEL}}")) {
      const withPhone = content.replace(/href="tel:[^"]*"/gi, 'href="{{SUPPORT_PHONE_TEL}}"');
      if (withPhone !== content) {
        content = withPhone;
        substitutions.add("numéro codé en dur → téléphone de support du modèle");
      }
    }

    return content === file.content ? file : { ...file, content };
  });

  return { files: transformed, substitutions: [...substitutions] };
}
