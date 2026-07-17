import type { ReactNode } from "react";

// ─────────────────────────────────────────────────────────────────────────
// Modèles de tickets / vouchers imprimables.
//
// Chaque modèle sait produire (1) une vignette React pour la modale de choix
// et (2) un document HTML A4 complet, auto-contenu (CSS + QR en data-URL en
// ligne), ouvert dans une fenêtre d'impression → « Enregistrer en PDF ».
// Aucune dépendance serveur : tout est calculé côté client au moment du clic.
// ─────────────────────────────────────────────────────────────────────────

export type TicketBrand = {
  hotspotName: string;
  logoUrl?: string | null;
  primaryColor?: string | null;
  supportPhone?: string | null;
  supportWhatsapp?: string | null;
};

export type TicketVoucher = {
  code: string;
  packageName: string;
  price?: string | null;
  validity?: string | null;
  /** QR déjà rendu en data-URL (PNG). */
  qr: string;
};

export type TicketTemplate = {
  id: string;
  name: string;
  description: string;
  tags: string[];
  /** Vignette d'aperçu affichée dans la modale. */
  Thumbnail: () => ReactNode;
  /** Construit le document HTML complet à imprimer. */
  buildDocument: (vouchers: TicketVoucher[], brand: TicketBrand) => string;
};

const DEFAULT_PRIMARY = "#B8860B"; // moutarde SafeLinkHub

function esc(s: string | null | undefined): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function supportLine(brand: TicketBrand): string {
  const parts: string[] = [];
  if (brand.supportPhone) parts.push(`Tél : ${brand.supportPhone}`);
  if (brand.supportWhatsapp) parts.push(`WhatsApp : ${brand.supportWhatsapp}`);
  return parts.join("  •  ");
}

function logoOrName(brand: TicketBrand, className: string): string {
  if (brand.logoUrl) {
    return `<img class="${className}" src="${esc(brand.logoUrl)}" alt="" />`;
  }
  return "";
}

// Enveloppe HTML commune : reset, format A4, saut de page propre, auto-print.
function htmlDoc(title: string, css: string, body: string): string {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { background: #fff; color: #1a1a1a;
    font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
  .page { width: 210mm; margin: 0 auto; padding: 8mm; }
  .grid { display: grid; gap: 4mm; }
  .ticket { break-inside: avoid; page-break-inside: avoid; }
  .mono { font-family: "SF Mono", "Roboto Mono", ui-monospace, "Courier New", monospace; }
  @media print {
    .page { margin: 0; padding: 6mm; width: auto; }
    @page { size: A4; margin: 6mm; }
  }
  ${css}
</style>
</head>
<body>
  <div class="page"><div class="grid">${body}</div></div>
  <script>window.addEventListener("load", function () { setTimeout(function () { window.print(); }, 250); });</script>
</body>
</html>`;
}

// ── 1. Voucher Business Personnalisé ──────────────────────────────────────
function buildBusiness(vouchers: TicketVoucher[], brand: TicketBrand): string {
  const primary = brand.primaryColor || DEFAULT_PRIMARY;
  const support = supportLine(brand);
  const cards = vouchers
    .map(
      (v) => `
    <div class="ticket">
      <div class="tk-head">
        ${logoOrName(brand, "tk-logo")}
        <span class="tk-brand">${esc(brand.hotspotName)}</span>
      </div>
      <div class="tk-body">
        <span class="tk-label">Code d'accès</span>
        <span class="tk-code mono">${esc(v.code)}</span>
        <div class="tk-meta">
          <span>${esc(v.packageName)}</span>
          ${v.validity ? `<span class="tk-dot">•</span><span>${esc(v.validity)}</span>` : ""}
          ${v.price ? `<span class="tk-price">${esc(v.price)}</span>` : ""}
        </div>
      </div>
      ${support ? `<div class="tk-foot">${esc(support)}</div>` : ""}
    </div>`,
    )
    .join("");
  const css = `
    .grid { grid-template-columns: repeat(2, 1fr); }
    .ticket { border: 1.5px solid #e5e0d5; border-radius: 10px; overflow: hidden;
      display: flex; flex-direction: column; }
    .tk-head { display: flex; align-items: center; gap: 8px; padding: 8px 12px;
      background: ${primary}; color: #fff; }
    .tk-logo { height: 20px; width: auto; object-fit: contain; filter: brightness(0) invert(1); }
    .tk-brand { font-weight: 700; font-size: 12px; letter-spacing: .3px; text-transform: uppercase; }
    .tk-body { padding: 12px; text-align: center; }
    .tk-label { display: block; font-size: 9px; letter-spacing: 1.5px; text-transform: uppercase; color: #8a8578; }
    .tk-code { display: block; margin-top: 4px; font-size: 26px; font-weight: 700;
      letter-spacing: 3px; color: #1a1a1a; }
    .tk-meta { margin-top: 8px; display: flex; align-items: center; justify-content: center;
      gap: 6px; flex-wrap: wrap; font-size: 11px; color: #57534e; }
    .tk-dot { color: #c9c3b4; }
    .tk-price { margin-left: 4px; font-weight: 700; color: ${primary}; }
    .tk-foot { padding: 6px 12px; border-top: 1px dashed #e5e0d5; font-size: 9px;
      color: #8a8578; text-align: center; }`;
  return htmlDoc(`Vouchers — ${brand.hotspotName}`, css, cards);
}

// ── 2. Modèle Classique (dense, N&B, économique) ──────────────────────────
function buildClassic(vouchers: TicketVoucher[], brand: TicketBrand): string {
  const cards = vouchers
    .map(
      (v) => `
    <div class="ticket">
      <span class="tk-name">${esc(brand.hotspotName)}</span>
      <span class="tk-code mono">${esc(v.code)}</span>
      <span class="tk-sub">${esc(v.validity || v.packageName)}</span>
    </div>`,
    )
    .join("");
  const css = `
    .grid { grid-template-columns: repeat(4, 1fr); gap: 0; }
    .ticket { border: 1px solid #111; margin: -0.5px; padding: 8px 6px; text-align: center;
      display: flex; flex-direction: column; gap: 2px; }
    .tk-name { font-size: 8px; text-transform: uppercase; letter-spacing: .5px; color: #444; }
    .tk-code { font-size: 16px; font-weight: 700; letter-spacing: 2px; color: #000; }
    .tk-sub { font-size: 8px; color: #555; }`;
  return htmlDoc(`Vouchers — ${brand.hotspotName}`, css, cards);
}

// ── 3. Modèle QR Moderne (couleur, QR proéminent) ─────────────────────────
function buildQrModern(vouchers: TicketVoucher[], brand: TicketBrand): string {
  const primary = brand.primaryColor || DEFAULT_PRIMARY;
  const cards = vouchers
    .map(
      (v) => `
    <div class="ticket">
      <div class="tk-side">
        <span class="tk-brand">${esc(brand.hotspotName)}</span>
        <span class="tk-code mono">${esc(v.code)}</span>
        <div class="tk-tags">
          <span>${esc(v.packageName)}</span>
          ${v.validity ? `<span>${esc(v.validity)}</span>` : ""}
        </div>
        ${v.price ? `<span class="tk-price">${esc(v.price)}</span>` : ""}
      </div>
      <div class="tk-qr"><img src="${esc(v.qr)}" alt="QR ${esc(v.code)}" /></div>
    </div>`,
    )
    .join("");
  const css = `
    .grid { grid-template-columns: repeat(2, 1fr); }
    .ticket { display: flex; border-radius: 12px; overflow: hidden;
      background: linear-gradient(135deg, ${primary} 0%, #1a1a1a 100%); color: #fff; }
    .tk-side { flex: 1; padding: 12px; display: flex; flex-direction: column; gap: 4px; }
    .tk-brand { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; opacity: .9; }
    .tk-code { font-size: 22px; font-weight: 800; letter-spacing: 2px; }
    .tk-tags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 2px; }
    .tk-tags span { font-size: 9px; padding: 2px 6px; border-radius: 999px; background: rgba(255,255,255,.18); }
    .tk-price { margin-top: auto; font-size: 14px; font-weight: 800; }
    .tk-qr { display: flex; align-items: center; justify-content: center; padding: 10px;
      background: #fff; }
    .tk-qr img { width: 74px; height: 74px; display: block; }`;
  return htmlDoc(`Vouchers — ${brand.hotspotName}`, css, cards);
}

// ── 4. Carte Business Premium (grand format, élégant) ─────────────────────
function buildPremium(vouchers: TicketVoucher[], brand: TicketBrand): string {
  const primary = brand.primaryColor || DEFAULT_PRIMARY;
  const support = supportLine(brand);
  const cards = vouchers
    .map(
      (v) => `
    <div class="ticket">
      <div class="tk-accent"></div>
      <div class="tk-content">
        <div class="tk-top">
          ${logoOrName(brand, "tk-logo")}
          <span class="tk-brand">${esc(brand.hotspotName)}</span>
        </div>
        <span class="tk-label">Votre code d'accès Wi-Fi</span>
        <span class="tk-code mono">${esc(v.code)}</span>
        <div class="tk-row">
          <div><span class="tk-k">Forfait</span><span class="tk-v">${esc(v.packageName)}</span></div>
          ${v.validity ? `<div><span class="tk-k">Validité</span><span class="tk-v">${esc(v.validity)}</span></div>` : ""}
          ${v.price ? `<div><span class="tk-k">Prix</span><span class="tk-v">${esc(v.price)}</span></div>` : ""}
        </div>
        ${support ? `<div class="tk-foot">${esc(support)}</div>` : ""}
      </div>
      <div class="tk-qr"><img src="${esc(v.qr)}" alt="QR ${esc(v.code)}" /></div>
    </div>`,
    )
    .join("");
  const css = `
    .grid { grid-template-columns: 1fr; gap: 6mm; }
    .ticket { display: flex; align-items: stretch; border: 1px solid #e5e0d5;
      border-radius: 14px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.06); }
    .tk-accent { width: 8px; background: ${primary}; }
    .tk-content { flex: 1; padding: 16px 18px; }
    .tk-top { display: flex; align-items: center; gap: 8px; }
    .tk-logo { height: 26px; width: auto; object-fit: contain; }
    .tk-brand { font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; color: ${primary}; }
    .tk-label { display: block; margin-top: 14px; font-size: 10px; letter-spacing: 1.5px;
      text-transform: uppercase; color: #8a8578; }
    .tk-code { display: block; margin-top: 4px; font-size: 38px; font-weight: 800; letter-spacing: 5px; color: #1a1a1a; }
    .tk-row { display: flex; gap: 28px; margin-top: 14px; }
    .tk-row .tk-k { display: block; font-size: 9px; text-transform: uppercase; letter-spacing: 1px; color: #a8a294; }
    .tk-row .tk-v { display: block; font-size: 13px; font-weight: 600; color: #1a1a1a; margin-top: 2px; }
    .tk-foot { margin-top: 14px; padding-top: 10px; border-top: 1px dashed #e5e0d5;
      font-size: 10px; color: #8a8578; }
    .tk-qr { display: flex; align-items: center; padding: 0 18px; background: #faf8f3; }
    .tk-qr img { width: 96px; height: 96px; display: block; }`;
  return htmlDoc(`Vouchers — ${brand.hotspotName}`, css, cards);
}

// ── 5. QR + Image de marque (QR au centre, support) ───────────────────────
function buildQrBrand(vouchers: TicketVoucher[], brand: TicketBrand): string {
  const primary = brand.primaryColor || DEFAULT_PRIMARY;
  const support = supportLine(brand);
  const cards = vouchers
    .map(
      (v) => `
    <div class="ticket">
      <div class="tk-head">
        ${logoOrName(brand, "tk-logo")}
        <span class="tk-brand">${esc(brand.hotspotName)}</span>
      </div>
      <div class="tk-qr"><img src="${esc(v.qr)}" alt="QR ${esc(v.code)}" /></div>
      <span class="tk-code mono">${esc(v.code)}</span>
      <span class="tk-sub">${esc([v.packageName, v.validity].filter(Boolean).join(" • "))}</span>
      ${support ? `<span class="tk-foot">${esc(support)}</span>` : ""}
    </div>`,
    )
    .join("");
  const css = `
    .grid { grid-template-columns: repeat(3, 1fr); }
    .ticket { border: 1.5px solid #e5e0d5; border-radius: 10px; padding: 10px;
      text-align: center; display: flex; flex-direction: column; align-items: center; gap: 5px; }
    .tk-head { display: flex; align-items: center; gap: 5px; }
    .tk-logo { height: 16px; width: auto; object-fit: contain; }
    .tk-brand { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .4px; color: ${primary}; }
    .tk-qr img { width: 88px; height: 88px; display: block; }
    .tk-code { font-size: 18px; font-weight: 700; letter-spacing: 2px; color: #1a1a1a; }
    .tk-sub { font-size: 9px; color: #57534e; }
    .tk-foot { font-size: 8px; color: #a8a294; border-top: 1px dashed #e5e0d5; padding-top: 5px; width: 100%; }`;
  return htmlDoc(`Vouchers — ${brand.hotspotName}`, css, cards);
}

// ── Vignettes d'aperçu (mini-maquettes fidèles au rendu) ──────────────────
const M = DEFAULT_PRIMARY;

function ThumbBusiness() {
  return (
    <div className="h-full w-full overflow-hidden rounded-md border border-line-soft bg-white">
      <div className="flex items-center gap-1 px-2 py-1" style={{ background: M }}>
        <div className="h-1 w-6 rounded-full bg-white/80" />
      </div>
      <div className="px-2 py-2 text-center">
        <div className="text-[5px] uppercase tracking-widest text-neutral-400">Code</div>
        <div className="font-mono text-[10px] font-bold tracking-widest text-neutral-800">A1B2C3</div>
        <div className="mt-0.5 text-[5px] text-neutral-400">01-JOUR • 500 F</div>
      </div>
    </div>
  );
}

function ThumbClassic() {
  return (
    <div className="grid h-full w-full grid-cols-3 bg-white">
      {Array.from({ length: 9 }).map((_, i) => (
        <div key={i} className="flex flex-col items-center justify-center border border-neutral-800 py-0.5">
          <span className="font-mono text-[6px] font-bold">x{i}9k</span>
        </div>
      ))}
    </div>
  );
}

function ThumbQrModern() {
  return (
    <div className="flex h-full w-full overflow-hidden rounded-md text-white"
      style={{ background: `linear-gradient(135deg, ${M} 0%, #1a1a1a 100%)` }}>
      <div className="flex-1 p-1.5">
        <div className="text-[5px] font-bold uppercase opacity-90">Wi-Fi</div>
        <div className="font-mono text-[9px] font-extrabold tracking-wide">A1B2</div>
        <div className="mt-1 inline-block rounded-full bg-white/20 px-1 text-[5px]">01-JOUR</div>
      </div>
      <div className="flex items-center bg-white p-1">
        <div className="grid h-6 w-6 grid-cols-3 grid-rows-3 gap-px">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className={i % 2 ? "bg-white" : "bg-neutral-900"} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ThumbPremium() {
  return (
    <div className="flex h-full w-full overflow-hidden rounded-md border border-line-soft bg-white">
      <div className="w-1" style={{ background: M }} />
      <div className="flex-1 p-1.5">
        <div className="text-[6px] font-bold uppercase" style={{ color: M }}>Hotspot</div>
        <div className="font-mono text-[12px] font-extrabold tracking-widest text-neutral-800">A1B2C3</div>
        <div className="mt-0.5 text-[5px] text-neutral-400">Forfait • Validité • Prix</div>
      </div>
      <div className="flex items-center bg-neutral-50 px-1">
        <div className="grid h-7 w-7 grid-cols-4 grid-rows-4 gap-px">
          {Array.from({ length: 16 }).map((_, i) => (
            <div key={i} className={(i * 7) % 3 ? "bg-neutral-900" : "bg-neutral-50"} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ThumbQrBrand() {
  return (
    <div className="grid h-full w-full grid-cols-2 gap-1 bg-white p-1">
      {Array.from({ length: 2 }).map((_, k) => (
        <div key={k} className="flex flex-col items-center gap-0.5 rounded border border-line-soft p-1">
          <div className="text-[5px] font-bold uppercase" style={{ color: M }}>Hotspot</div>
          <div className="grid h-6 w-6 grid-cols-3 grid-rows-3 gap-px">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className={(i + k) % 2 ? "bg-white" : "bg-neutral-900"} />
            ))}
          </div>
          <div className="font-mono text-[6px] font-bold">A1B2</div>
        </div>
      ))}
    </div>
  );
}

export const TICKET_TEMPLATES: TicketTemplate[] = [
  {
    id: "business",
    name: "Voucher Business Personnalisé",
    description: "Style professionnel avec image de marque du hotspot et coordonnées",
    tags: ["Nom du Hotspot", "Contacts Support", "Professionnel"],
    Thumbnail: ThumbBusiness,
    buildDocument: buildBusiness,
  },
  {
    id: "classic",
    name: "Modèle Classique",
    description: "Design en grille propre et professionnel, dense et économique",
    tags: ["Liste de codes", "Noir & Blanc", "Économique"],
    Thumbnail: ThumbClassic,
    buildDocument: buildClassic,
  },
  {
    id: "qr-modern",
    name: "Modèle QR Moderne",
    description: "Design contemporain avec couleurs vives et QR code",
    tags: ["QR Code", "Couleur", "Design Moderne"],
    Thumbnail: ThumbQrModern,
    buildDocument: buildQrModern,
  },
  {
    id: "premium",
    name: "Carte Business Premium",
    description: "Design premium plus grand avec image de marque mise en avant",
    tags: ["Grand format", "QR Code", "Premium"],
    Thumbnail: ThumbPremium,
    buildDocument: buildPremium,
  },
  {
    id: "qr-brand",
    name: "QR + Image de marque",
    description: "Vouchers QR code avec nom du hotspot et coordonnées",
    tags: ["QR Code", "Support", "Compact"],
    Thumbnail: ThumbQrBrand,
    buildDocument: buildQrBrand,
  },
];
