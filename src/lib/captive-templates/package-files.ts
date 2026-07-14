import { readFileSync } from "fs";
import path from "path";
import { countryFlag } from "../intl/countries";

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
  id: string; // package id — envoyé à /api/portal/<slug>/initiate au paiement
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
  // Câblage du paiement en ligne (portail captif) : URL absolue de SafeLinkHub
  // (le portail est servi par le routeur → il lui faut l'origine absolue),
  // slug de l'org et id du routeur cible. Injectés dans {{APP_URL}} /
  // {{ORG_SLUG}} / {{ROUTER_ID}}.
  appUrl?: string | null;
  slug?: string | null;
  routerId?: string | null;
  // Pays où opère le routeur (déduit de l'org) : préfixe d'appel injecté dans
  // le champ téléphone du portail (ex. CI → 🇨🇮 +225). Le client saisit son
  // numéro local, le serveur reconstitue l'international.
  dialCode?: string | null; // ex. "+225"
  countryIso2?: string | null; // ex. "CI"
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
// plan-price CSS-class family of the bundled SafeLinkHub portal and the
// operator-made ones derived from it — the import-time auto-parameterization
// (see autoParameterizePortalFiles) swaps a portal's hardcoded `plans-grid`
// cards for {{PLANS_HTML}}, so the portal's own stylesheet keeps styling these.
// Plus de bouton « Acheter » par carte (redondant avec le bouton « Payer »
// global) : les `data-*` sont portés par la carte elle-même — taper la carte
// ouvre le modal d'achat (le binder universel matche tout `[data-package-id]`,
// voir PORTAL_PAY_SCRIPT). La carte porte le `data-price` humain ("200 FCFA",
// pour le toast JS du portail), un `data-price-cents` machine pour le paiement,
// et `data-plan` (libellé affiché).
function renderPlansHtml(plans: PortalPlan[] | null | undefined): string {
  if (!plans || plans.length === 0) return "";
  return plans
    .map((plan) => {
      const label = escapeHtml(planDisplayName(plan));
      const priceLabel = escapeHtml(formatFcfa(plan.priceCents));
      return `          <div class="plan-card" role="button" tabindex="0" data-plan="${label}" data-price="${priceLabel}" data-price-cents="${plan.priceCents}" data-package-id="${escapeHtml(plan.id)}">
            <div class="plan-info">
              <span class="plan-name">${label}</span>
              <span class="plan-details">Illimité</span>
            </div>
            <span class="plan-price">${priceLabel}</span>
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
      const planLabel = escapeHtml(planDisplayName(plan));
      // data-* pour le binder de paiement universel (voir PORTAL_PAY_SCRIPT).
      // L'onclick legacy reste comme repli quand le paiement n'est pas configuré
      // (le binder universel intercepte en capture et neutralise cet onclick).
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
      <button onclick="openPhoneModal('${onclickArg}')" class="btn-pay" data-package-id="${escapeHtml(plan.id)}" data-plan="${planLabel}" data-price="${priceLabel}">
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
      id: plan.id,
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
// Script de paiement UNIVERSEL injecté dans chaque login.html au rendu, quel
// que soit le portail (bundled OU importé). Un listener délégué en phase
// CAPTURE intercepte tout bouton `[data-package-id]` AVANT les handlers propres
// au portail (plan-btn de SafeLinkHub, btn-pay/onclick de Yahya, boutons auto-
// paramétrés d'un portail importé) → une seule implémentation du flux d'achat.
// Contraintes (chaîne dans un template literal TS) : aucun backslash, aucun
// backtick, aucun "${" ; apostrophes en guillemets doubles ; accents littéraux.
const PORTAL_PAY_SCRIPT = `(function(){
  var cfg = window.SLH_PORTAL || {};
  function configured(){ return !!(cfg && cfg.appUrl && cfg.slug && cfg.mac && String(cfg.mac).indexOf("$(") !== 0); }
  function esc(s){ return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
  function digits(s){ return String(s==null?"":s).replace(/[^0-9]/g,""); }
  function api(p){ return cfg.appUrl + "/api/portal/" + encodeURIComponent(cfg.slug) + p; }
  // Un échec fetch bas-niveau (walled-garden qui bloque safelinkhub.io, coupure
  // réseau) remonte "Load failed" / "Failed to fetch" : message clair au client.
  function errMsg(err){ var m = err && err.message ? String(err.message) : ""; if(!m || /load failed|failed to fetch|networkerror|network request failed/i.test(m)) return "Connexion au serveur impossible. Restez sur le portail WiFi et reessayez."; return m; }

  var lastSel = null; // dernier forfait choisi (carte tapée OU bouton Acheter)
  function planFromBtn(b){ return { packageId: b.getAttribute("data-package-id"), plan: b.getAttribute("data-plan") || "ce forfait", price: b.getAttribute("data-price") || "" }; }
  // Carte de forfait = plus grand ancêtre ne contenant QU'UN bouton
  // [data-package-id] (ex. .plan-card). Permet de retrouver le forfait quand le
  // client tape ailleurs sur la carte (nom, prix) que sur le bouton lui-même.
  function cardOf(el){
    var node = el, card = null;
    while(node && node !== document.body){
      if(node.querySelectorAll && node.querySelectorAll("[data-package-id]").length === 1){ card = node; }
      else if(card){ break; }
      node = node.parentElement;
    }
    return card;
  }
  // Bouton "Payer" GLOBAL du portail (hors carte, sans data-package-id) : il doit
  // acheter le forfait sélectionné. On l'identifie par son libellé, et on exclut
  // notre propre modal (dont le bouton primaire s'appelle aussi "Payer").
  function isGlobalPayBtn(el){
    if(!el || !el.closest) return false;
    if(el.closest("#slh-pay-modal")) return false;
    var b = el.closest("button, a, input[type=submit], input[type=button], [role=button]");
    if(!b || b.getAttribute("data-package-id")) return false;
    var label = (b.textContent || b.value || "").trim().toLowerCase();
    if(!label || label.length > 24) return false;
    return label === "payer" || label === "payer maintenant" || label.indexOf("payer ") === 0 || label === "acheter" || label === "valider";
  }
  function hint(msg){
    var h = document.getElementById("slh-hint");
    if(!h){ h = document.createElement("div"); h.id = "slh-hint"; h.style.cssText = "position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2147483000;background:#0f172a;color:#fff;padding:10px 16px;border-radius:10px;font:600 14px system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.3);max-width:90%;text-align:center;transition:opacity .3s;"; document.body.appendChild(h); }
    h.textContent = msg; h.style.opacity = "1";
    if(h._t) clearTimeout(h._t);
    h._t = setTimeout(function(){ h.style.opacity = "0"; }, 3200);
  }

  document.addEventListener("click", function(e){
    if(!configured()) return; // repli : laisse le portail gérer ses boutons
    var t = e.target;
    // 1) Bouton d'un forfait (Acheter par carte) → achat direct.
    var btn = t && t.closest ? t.closest("[data-package-id]") : null;
    if(btn){
      e.preventDefault(); e.stopImmediatePropagation();
      lastSel = planFromBtn(btn);
      openModal(lastSel);
      return;
    }
    // 2) Bouton "Payer" global → achète le forfait sélectionné.
    if(isGlobalPayBtn(t)){
      e.preventDefault(); e.stopImmediatePropagation();
      if(lastSel){ openModal(lastSel); return; }
      var all = document.querySelectorAll("[data-package-id]");
      if(all.length === 1){ lastSel = planFromBtn(all[0]); openModal(lastSel); return; }
      hint("Choisissez d'abord un forfait ci-dessus, puis appuyez sur Payer.");
      return;
    }
    // 3) Sélection : le client tape une carte → on la mémorise (sans bloquer la
    //    mise en surbrillance propre au portail).
    var card = cardOf(t);
    if(card){ var pb = card.querySelector("[data-package-id]"); if(pb) lastSel = planFromBtn(pb); }
  }, true);

  // Accessibilite clavier : une carte de forfait (role=button, tabindex=0) n'est
  // plus un <button>, donc Entree/Espace ne declenchent pas de clic natif. On le
  // synthetise pour que le meme flux d'achat s'ouvre. Purement additif.
  document.addEventListener("keydown", function(e){
    if(!configured()) return;
    if(e.key !== "Enter" && e.key !== " " && e.key !== "Spacebar") return;
    var el = e.target;
    var card = el && el.closest ? el.closest("[data-package-id]") : null;
    if(card){ e.preventDefault(); card.click(); }
  }, true);

  function openModal(sel){
    var old = document.getElementById("slh-pay-modal"); if(old) old.remove();
    var dial = cfg.dialCode || "";
    var flag = cfg.flag || "";
    var prefix = (flag ? flag + " " : "") + dial;
    var o = document.createElement("div");
    o.id = "slh-pay-modal";
    o.style.cssText = "position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.55);padding:16px;";
    o.innerHTML = '<div style="background:#fff;color:#0f172a;border-radius:14px;max-width:360px;width:100%;padding:22px;box-shadow:0 10px 40px rgba(0,0,0,.3);font-family:system-ui,sans-serif;">'
      + '<h3 style="margin:0 0 4px;font-size:1.1rem;">Acheter ' + esc(sel.plan) + '</h3>'
      + '<p style="margin:0 0 16px;font-size:.9rem;color:#64748b;">' + esc(sel.price) + ' &middot; Mobile Money / Carte</p>'
      + '<div data-step="phone">'
      +   '<label style="display:block;font-size:.8rem;margin-bottom:6px;">Votre num&eacute;ro</label>'
      +   '<div style="display:flex;gap:6px;margin-bottom:6px;">'
      +     (prefix ? '<span style="display:flex;align-items:center;padding:0 10px;border:1px solid #cbd5e1;border-radius:8px;background:#f8fafc;font-size:.95rem;white-space:nowrap;">' + esc(prefix) + '</span>' : '')
      +     '<input id="slh-phone" type="tel" inputmode="numeric" placeholder="07 00 00 00 00" autocomplete="tel" style="flex:1;min-width:0;box-sizing:border-box;padding:11px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:1rem;" />'
      +   '</div>'
      +   '<p style="margin:0 0 12px;font-size:.72rem;color:#94a3b8;">Un code de v&eacute;rification vous sera envoy&eacute; par SMS.</p>'
      + '</div>'
      + '<div data-step="otp" style="display:none;">'
      +   '<p style="margin:0 0 8px;font-size:.85rem;">Entrez le code re&ccedil;u par SMS au <b id="slh-otp-to"></b></p>'
      +   '<input id="slh-otp" type="tel" inputmode="numeric" maxlength="6" placeholder="------" autocomplete="one-time-code" style="width:100%;box-sizing:border-box;padding:11px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:1.3rem;letter-spacing:.4em;text-align:center;margin-bottom:8px;" />'
      +   '<button id="slh-otp-resend" type="button" style="background:none;border:0;color:#0ea5e9;font-size:.8rem;padding:0;">Renvoyer le code</button>'
      + '</div>'
      + '<div data-step="pay" style="display:none;">'
      +   '<p style="margin:0 0 12px;font-size:.9rem;">Num&eacute;ro v&eacute;rifi&eacute;. Appuyez sur <b>Payer</b> pour choisir votre moyen de paiement (Wave, Orange, MTN, carte).</p>'
      + '</div>'
      + '<div data-step="done" style="display:none;text-align:center;">'
      +   '<p style="margin:0 0 6px;font-size:.85rem;color:#64748b;">Votre code d&#39;acc&egrave;s WiFi</p>'
      +   '<div id="slh-code" style="font-size:1.8rem;font-weight:700;letter-spacing:.15em;">------</div>'
      +   '<p style="margin:8px 0 0;font-size:.72rem;color:#94a3b8;">Envoy&eacute; aussi par SMS. Connexion en cours&hellip;</p>'
      + '</div>'
      + '<div id="slh-status" style="display:none;font-size:.85rem;margin:12px 0 0;"></div>'
      + '<div style="display:flex;gap:8px;margin-top:16px;">'
      +   '<button id="slh-cancel" type="button" style="flex:1;padding:11px;border:1px solid #cbd5e1;background:#fff;color:#0f172a;border-radius:8px;font-size:.9rem;">Fermer</button>'
      +   '<button id="slh-primary" type="button" style="flex:2;padding:11px;border:0;background:#10b981;color:#fff;border-radius:8px;font-size:.9rem;font-weight:600;">Recevoir le code</button>'
      + '</div>'
      + '</div>';
    document.body.appendChild(o);

    var step = "phone";
    var phoneEl = document.getElementById("slh-phone");
    var otpEl = document.getElementById("slh-otp");
    var primary = document.getElementById("slh-primary");
    var cancel = document.getElementById("slh-cancel");
    var statusEl = document.getElementById("slh-status");
    var resend = document.getElementById("slh-otp-resend");
    var cdTimer = null;
    setTimeout(function(){ if(phoneEl) phoneEl.focus(); }, 100);

    function setStatus(m,c){ if(!m){ statusEl.style.display="none"; return; } statusEl.style.display="block"; statusEl.style.color = c || "#64748b"; statusEl.textContent = m; }
    function localPhone(){ return digits(phoneEl.value); }
    function show(name){
      step = name;
      var steps = o.querySelectorAll("[data-step]");
      for(var i=0;i<steps.length;i++){ steps[i].style.display = steps[i].getAttribute("data-step")===name ? "" : "none"; }
      if(name==="phone"){ primary.textContent = "Recevoir le code"; }
      else if(name==="otp"){ primary.textContent = "Vérifier"; setTimeout(function(){ if(otpEl) otpEl.focus(); }, 80); }
      else if(name==="pay"){ primary.textContent = "Payer"; }
      else if(name==="done"){ primary.textContent = "Se connecter"; }
    }

    cancel.addEventListener("click", function(){ if(cdTimer) clearInterval(cdTimer); o.remove(); });
    o.addEventListener("click", function(ev){ if(ev.target===o){ if(cdTimer) clearInterval(cdTimer); o.remove(); } });
    primary.addEventListener("click", function(){
      if(step==="phone") sendOtp(false);
      else if(step==="otp") verifyOtp();
      else if(step==="pay") startPayment();
      else if(step==="done") connect(document.getElementById("slh-code").textContent);
    });
    resend.addEventListener("click", function(){ if(!resend.disabled) sendOtp(true); });
    phoneEl.addEventListener("keydown", function(ev){ if(ev.key==="Enter") primary.click(); });
    otpEl.addEventListener("keydown", function(ev){ if(ev.key==="Enter") primary.click(); });

    function startCooldown(){
      if(cdTimer) clearInterval(cdTimer);
      var left = 45; resend.disabled = true;
      function tick(){ resend.textContent = left>0 ? ("Renvoyer dans " + left + "s") : "Renvoyer le code"; if(left<=0){ resend.disabled=false; if(cdTimer) clearInterval(cdTimer); } left--; }
      tick(); cdTimer = setInterval(tick, 1000);
    }

    function sendOtp(isResend){
      var lp = localPhone();
      if(lp.length < 7){ setStatus("Numéro invalide.", "#ef4444"); return; }
      primary.disabled = true;
      setStatus(isResend ? "Renvoi du code..." : "Envoi du code...");
      fetch(api("/otp/send"), { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ phone: lp }) })
        .then(function(r){ return r.json().then(function(j){ return { ok:r.ok, j:j }; }); })
        .then(function(res){
          primary.disabled = false;
          if(!res.ok) throw new Error(res.j && res.j.error ? res.j.error : "Envoi impossible.");
          if(res.j.status === "verified"){ setStatus(""); show("pay"); return; }
          var to = document.getElementById("slh-otp-to"); if(to) to.textContent = res.j.to || "";
          setStatus(""); show("otp"); startCooldown();
        })
        .catch(function(err){ primary.disabled = false; setStatus(errMsg(err), "#ef4444"); });
    }

    function verifyOtp(){
      var code = digits(otpEl.value);
      if(code.length < 4){ setStatus("Entrez le code reçu.", "#ef4444"); return; }
      primary.disabled = true; setStatus("Vérification...");
      fetch(api("/otp/verify"), { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ phone: localPhone(), code: code }) })
        .then(function(r){ return r.json().then(function(j){ return { ok:r.ok, j:j }; }); })
        .then(function(res){
          primary.disabled = false;
          if(!res.ok || !res.j.verified) throw new Error(res.j && res.j.error ? res.j.error : "Code incorrect.");
          if(cdTimer) clearInterval(cdTimer);
          setStatus(""); show("pay");
        })
        .catch(function(err){ primary.disabled = false; setStatus(errMsg(err), "#ef4444"); });
    }

    function startPayment(){
      primary.disabled = true; primary.textContent = "Traitement..."; setStatus("Création du paiement...");
      fetch(api("/initiate"), { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ packageId: sel.packageId, phone: localPhone(), mac: cfg.mac, routerId: cfg.routerId || "" }) })
        .then(function(r){ return r.json().then(function(j){ return { ok:r.ok, j:j }; }); })
        .then(function(res){
          if(!res.ok) throw new Error(res.j && res.j.error ? res.j.error : "Echec du paiement.");
          // Le portail captif iOS/Android ne peut PAS ouvrir de nouvel onglet :
          // on redirige la MÊME fenêtre vers la page de paiement hébergée
          // (safelinkhub.io, fiable) où le client choisit son moyen de paiement.
          setStatus("Redirection vers le paiement...", "#0ea5e9");
          window.location.href = res.j.payUrl || res.j.checkoutUrl;
        })
        .catch(function(err){ primary.disabled = false; primary.textContent = "Payer"; setStatus(errMsg(err), "#ef4444"); });
    }

    function poll(orderId){
      var tries = 0, max = 90;
      var timer = setInterval(function(){
        tries++;
        if(tries > max){ clearInterval(timer); setStatus("Délai dépassé. Si vous avez payé, réessayez.", "#ef4444"); primary.disabled=false; primary.textContent="Payer"; return; }
        fetch(api("/status?orderId=" + encodeURIComponent(orderId)), { cache:"no-store" })
          .then(function(r){ return r.json(); })
          .then(function(d){
            if(d.status==="fulfilled" && d.code){ clearInterval(timer); onCode(d.code); }
            else if(d.status==="failed"){ clearInterval(timer); setStatus(d.error || "Paiement échoué.", "#ef4444"); primary.disabled=false; primary.textContent="Payer"; }
          }).catch(function(){});
      }, 4000);
    }

    function onCode(code){
      var cEl = document.getElementById("slh-code"); if(cEl) cEl.textContent = code;
      show("done");
      primary.disabled = false;
      cancel.style.display = "none";
      setStatus("Paiement confirmé !", "#10b981");
      try { localStorage.setItem("safelinkhub_last_ticket", code); } catch(e){}
      setTimeout(function(){ connect(code); }, 1200);
    }

    function connect(code){
      try { localStorage.setItem("safelinkhub_last_ticket", code); } catch(e){}
      var u = document.querySelector('[name="username"]');
      var p = document.querySelector('[name="password"]');
      var form = document.forms["login"] || (u && u.form) || document.querySelector('form[action*="login"]') || document.querySelector("form");
      if(u) u.value = code;
      if(p) p.value = code;
      if(!form) return;
      if(form.requestSubmit) form.requestSubmit(); else form.submit();
    }

    show("phone");
  }
})();`;

/** Bloc <script> injecté en fin de login.html : config + flux de paiement. */
function portalPayInjection(vars: PackageBrandingVars): string {
  const iso2 = (vars.countryIso2 ?? "").toUpperCase();
  const config = JSON.stringify({
    appUrl: vars.appUrl ?? "",
    slug: vars.slug ?? "",
    routerId: vars.routerId ?? "",
    mac: "$(mac)", // remplacé par le routeur (variable hotspot) au service de la page
    dialCode: vars.dialCode ?? "",
    iso2,
    flag: iso2 ? countryFlag(iso2) : "",
  });
  return `\n<script>window.SLH_PORTAL=${config};</script>\n<script>${PORTAL_PAY_SCRIPT}</script>\n`;
}

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
    .replaceAll("{{SUPPORT_WHATSAPP}}", vars.supportWhatsapp ?? "")
    .replaceAll("{{APP_URL}}", vars.appUrl ?? "")
    .replaceAll("{{ORG_SLUG}}", vars.slug ?? "")
    .replaceAll("{{ROUTER_ID}}", vars.routerId ?? "");

  // Injecte le flux de paiement universel dans la page de login de N'IMPORTE
  // quel portail. Conditionné à appUrl (contexte réel de service, pas les
  // tests) et à la page login pour ne pas alourdir les autres fichiers.
  const isLoginPage = /(^|\/)login\.html$/i.test(file.path);
  if (isLoginPage && vars.appUrl) {
    const injection = portalPayInjection(vars);
    const out = /<\/body>/i.test(rendered)
      ? rendered.replace(/<\/body>/i, `${injection}</body>`)
      : rendered + injection;
    return Buffer.from(out, "utf8");
  }

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
