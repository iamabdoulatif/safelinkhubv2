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
function htmlDoc(title: string, css: string, body: string, page = "A4"): string {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box;
    /* Sans ceci, le navigateur retire fonds et couleurs à l'impression : un
       ticket coloré sortait blanc. */
    -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { background: #fff; color: #1a1a1a;
    font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
  .page { width: 210mm; margin: 0 auto; padding: 8mm; }
  .grid { display: grid; gap: 4mm; }
  .ticket { break-inside: avoid; page-break-inside: avoid; }
  .mono { font-family: "SF Mono", "Roboto Mono", ui-monospace, "Courier New", monospace; }
  @media print {
    .page { margin: 0; padding: 6mm; width: auto; }
    @page { size: ${page}; margin: 6mm; }
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


/** Numéro de ticket lisible dans le lot : « N° 0007 ». */
function ticketNo(i: number): string {
  return `N° ${String(i + 1).padStart(4, "0")}`;
}

// ── 6. Ticket à souche (bords perforés, QR + mentions) ────────────────────
function buildStub(vouchers: TicketVoucher[], brand: TicketBrand): string {
  const accent = brand.primaryColor || "#D7261E";
  const cards = vouchers
    .map(
      (v, i) => `
    <div class="ticket stub">
      <div class="stub-in">
        <div class="stub-qr"><img src="${esc(v.qr)}" alt="QR ${esc(v.code)}" /></div>
        <div class="stub-scan">Scannez-moi</div>
        <div class="stub-body">
          <span class="stub-plan">${esc(v.packageName)}</span>
          <span class="stub-code">${esc(v.code)}</span>
          ${v.validity ? `<span class="stub-validity">${esc(v.validity)}</span>` : ""}
          <span class="stub-ref">${esc(brand.hotspotName)} · ${ticketNo(i)}${v.price ? ` · ${esc(v.price)}` : ""}</span>
          <span class="stub-legal">Usage unique · Non remboursable</span>
        </div>
      </div>
    </div>`,
    )
    .join("");
  // Festons : deux demi-masques (gauche / droite) de cercles répétés. Le
  // cadre noir est masqué, la face blanche aussi, décalée de 2 px — le noir
  // qui dépasse dessine le contour ondulé.
  const scallop = (r: number) =>
    `radial-gradient(circle ${r}px at 0 50%, #0000 97%, #000) left / 51% 14px repeat-y,
     radial-gradient(circle ${r}px at 100% 50%, #0000 97%, #000) right / 51% 14px repeat-y`;
  const css = `
    .grid { grid-template-columns: repeat(2, 1fr); gap: 5mm 6mm; }
    .stub { position: relative; background: #111; padding: 2px 3px; -webkit-mask: ${scallop(5)}; mask: ${scallop(5)}; }
    .stub-in { display: flex; align-items: center; gap: 8px; background: #fff; padding: 10px 16px;
      -webkit-mask: ${scallop(5)}; mask: ${scallop(5)}; }
    .stub-qr img { width: 78px; height: 78px; display: block; }
    .stub-scan { writing-mode: vertical-rl; transform: rotate(180deg); font-size: 9px; font-weight: 800;
      letter-spacing: 1.5px; text-transform: uppercase; color: ${accent}; }
    .stub-body { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; text-align: center; }
    .stub-plan { font-size: 20px; font-weight: 900; color: ${accent}; line-height: 1.05; }
    .stub-code { margin-top: 2px; font-size: 21px; font-weight: 900; letter-spacing: 1px; color: ${accent}; }
    .stub-validity { margin-top: 2px; font-size: 13px; font-weight: 800; text-transform: uppercase; color: #111; }
    .stub-ref { margin-top: 4px; font-size: 8.5px; font-weight: 700; color: #111; }
    .stub-legal { font-size: 8px; font-weight: 800; text-transform: uppercase; color: #111; }`;
  return htmlDoc(`Tickets — ${brand.hotspotName}`, css, cards);
}

// ── 7. Carte d'embarquement (corps + souche détachable) ───────────────────
function buildBoarding(vouchers: TicketVoucher[], brand: TicketBrand): string {
  const primary = brand.primaryColor || "#12301D";
  const support = supportLine(brand);
  const cards = vouchers
    .map(
      (v, i) => `
    <div class="ticket pass">
      <div class="pass-main">
        <div class="pass-top">
          ${logoOrName(brand, "pass-logo")}
          <span class="pass-brand">${esc(brand.hotspotName)}</span>
          <span class="pass-kind">Accès Wi-Fi</span>
        </div>
        <div class="pass-fields">
          <div><span class="k">Forfait</span><span class="v">${esc(v.packageName)}</span></div>
          <div><span class="k">Durée</span><span class="v">${esc(v.validity || "—")}</span></div>
          <div><span class="k">Prix</span><span class="v">${esc(v.price || "—")}</span></div>
        </div>
        <div class="pass-codebox"><span class="k">Code d'accès</span><span class="pass-code mono">${esc(v.code)}</span></div>
        ${support ? `<div class="pass-foot">${esc(support)}</div>` : ""}
      </div>
      <div class="pass-stub">
        <img src="${esc(v.qr)}" alt="QR ${esc(v.code)}" />
        <span class="pass-stub-code mono">${esc(v.code)}</span>
        <span class="pass-no">${ticketNo(i)}</span>
      </div>
    </div>`,
    )
    .join("");
  const css = `
    .grid { grid-template-columns: 1fr; gap: 5mm; }
    .pass { display: flex; border: 1.5px solid #1a1a1a; border-radius: 12px; overflow: hidden; }
    .pass-main { flex: 1; padding: 12px 16px; }
    .pass-top { display: flex; align-items: center; gap: 8px; padding-bottom: 8px; border-bottom: 1.5px solid ${primary}; }
    .pass-logo { height: 22px; width: auto; object-fit: contain; }
    .pass-brand { font-size: 14px; font-weight: 800; text-transform: uppercase; letter-spacing: .5px; color: ${primary}; }
    .pass-kind { margin-left: auto; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px;
      color: #fff; background: ${primary}; padding: 3px 8px; border-radius: 999px; }
    .pass-fields { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 10px; }
    .k { display: block; font-size: 8.5px; text-transform: uppercase; letter-spacing: 1.2px; color: #777; }
    .v { display: block; margin-top: 2px; font-size: 13px; font-weight: 700; color: #111; }
    .pass-codebox { margin-top: 10px; }
    .pass-code { display: block; margin-top: 2px; font-size: 30px; font-weight: 800; letter-spacing: 5px; color: #111; }
    .pass-foot { margin-top: 8px; font-size: 9px; color: #777; }
    .pass-stub { position: relative; width: 132px; display: flex; flex-direction: column; align-items: center;
      justify-content: center; gap: 4px; padding: 10px; border-left: 2px dashed #1a1a1a; background: #f6f5f1; }
    .pass-stub::before, .pass-stub::after { content: ""; position: absolute; left: -9px; width: 16px; height: 16px;
      border-radius: 50%; background: #fff; border: 1.5px solid #1a1a1a; }
    .pass-stub::before { top: -9px; } .pass-stub::after { bottom: -9px; }
    .pass-stub img { width: 86px; height: 86px; display: block; }
    .pass-stub-code { font-size: 13px; font-weight: 800; letter-spacing: 2px; }
    .pass-no { font-size: 8.5px; color: #777; }`;
  return htmlDoc(`Tickets — ${brand.hotspotName}`, css, cards);
}

// ── 8. Reçu thermique 58 mm (imprimante de caisse) ────────────────────────
function buildThermal(vouchers: TicketVoucher[], brand: TicketBrand): string {
  const support = supportLine(brand);
  const now = new Date().toLocaleDateString("fr-FR");
  const cards = vouchers
    .map(
      (v, i) => `
    <div class="ticket receipt">
      <div class="r-brand">${esc(brand.hotspotName)}</div>
      <div class="r-sub">TICKET WI-FI · ${ticketNo(i)}</div>
      <div class="r-rule"></div>
      <div class="r-line"><span>Forfait</span><span>${esc(v.packageName)}</span></div>
      ${v.validity ? `<div class="r-line"><span>Durée</span><span>${esc(v.validity)}</span></div>` : ""}
      ${v.price ? `<div class="r-line"><span>Prix</span><span>${esc(v.price)}</span></div>` : ""}
      <div class="r-rule"></div>
      <div class="r-label">CODE</div>
      <div class="r-code">${esc(v.code)}</div>
      <img class="r-qr" src="${esc(v.qr)}" alt="QR ${esc(v.code)}" />
      <div class="r-rule"></div>
      <div class="r-foot">Connectez-vous au Wi-Fi, puis saisissez le code.${support ? `<br/>${esc(support)}` : ""}<br/>${now} · Merci !</div>
    </div>`,
    )
    .join("");
  const css = `
    .page { width: 58mm; padding: 2mm; }
    .grid { grid-template-columns: 1fr; gap: 0; }
    .receipt { font-family: "Courier New", ui-monospace, monospace; color: #000; text-align: center;
      padding: 3mm 1mm 5mm; border-bottom: 1px dashed #000; }
    .r-brand { font-size: 14px; font-weight: 700; text-transform: uppercase; }
    .r-sub { font-size: 9px; margin-top: 1px; }
    .r-rule { border-top: 1px dashed #000; margin: 2mm 0; }
    .r-line { display: flex; justify-content: space-between; gap: 6px; font-size: 10px; }
    .r-line span:last-child { font-weight: 700; text-align: right; }
    .r-label { font-size: 9px; letter-spacing: 2px; }
    .r-code { font-size: 20px; font-weight: 700; letter-spacing: 3px; margin: 1mm 0 2mm; }
    .r-qr { width: 30mm; height: 30mm; display: block; margin: 0 auto; }
    .r-foot { font-size: 8.5px; line-height: 1.4; }
    @media print { .page { width: 58mm; padding: 0; } }`;
  return htmlDoc(`Tickets — ${brand.hotspotName}`, css, cards, "58mm auto");
}

// ── 9. Planche d'étiquettes A4 (3 × 8, 70 × 37 mm) ────────────────────────
function buildLabels(vouchers: TicketVoucher[], brand: TicketBrand): string {
  const primary = brand.primaryColor || DEFAULT_PRIMARY;
  const cards = vouchers
    .map(
      (v) => `
    <div class="ticket label">
      <img src="${esc(v.qr)}" alt="QR ${esc(v.code)}" />
      <div class="l-txt">
        <span class="l-brand">${esc(brand.hotspotName)}</span>
        <span class="l-code mono">${esc(v.code)}</span>
        <span class="l-meta">${esc([v.validity || v.packageName, v.price].filter(Boolean).join(" · "))}</span>
      </div>
    </div>`,
    )
    .join("");
  // Format d'étiquettes autocollantes courant (3 colonnes × 8 lignes) : les
  // marges suivent la planche, pas la page par défaut.
  const css = `
    .page { width: 210mm; padding: 13mm 0 0 0; }
    .grid { grid-template-columns: repeat(3, 70mm); grid-auto-rows: 37mm; gap: 0; }
    .label { display: flex; align-items: center; gap: 3mm; padding: 3mm 4mm; border: 0.3px dotted #ccc; overflow: hidden; }
    .label img { width: 24mm; height: 24mm; display: block; }
    .l-txt { min-width: 0; display: flex; flex-direction: column; gap: 1mm; }
    .l-brand { font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: .4px; color: ${primary};
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .l-code { font-size: 15px; font-weight: 800; letter-spacing: 1.5px; color: #111; }
    .l-meta { font-size: 8px; color: #555; }
    @media print { .page { padding: 13mm 0 0 0; } .label { border-color: transparent; } @page { margin: 0; } }`;
  return htmlDoc(`Étiquettes — ${brand.hotspotName}`, css, cards);
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


function MiniQr({ size = 6, seed = 0 }: { size?: number; seed?: number }) {
  return (
    <div className="grid shrink-0 grid-cols-4 grid-rows-4 gap-px" style={{ width: size * 4, height: size * 4 }}>
      {Array.from({ length: 16 }).map((_, i) => (
        <div key={i} className={(i * 7 + seed) % 3 ? "bg-neutral-900" : "bg-white"} />
      ))}
    </div>
  );
}

function ThumbStub() {
  const r = "#D7261E";
  const scallop =
    "radial-gradient(circle 3px at 0 50%, #0000 97%, #000) left / 51% 8px repeat-y, radial-gradient(circle 3px at 100% 50%, #0000 97%, #000) right / 51% 8px repeat-y";
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="bg-neutral-900 p-px" style={{ WebkitMask: scallop, mask: scallop }}>
        <div className="flex items-center gap-1 bg-white px-2.5 py-1" style={{ WebkitMask: scallop, mask: scallop }}>
          <MiniQr size={5} />
          <span className="text-[4px] font-extrabold uppercase [writing-mode:vertical-rl] rotate-180" style={{ color: r }}>Scan</span>
          <span className="flex flex-col items-center leading-none">
            <span className="text-[10px] font-black" style={{ color: r }}>1 JOUR</span>
            <span className="font-mono text-[7px] font-bold" style={{ color: r }}>RUP8R4DH</span>
            <span className="mt-0.5 text-[4px] font-bold uppercase">Usage unique</span>
          </span>
        </div>
      </div>
    </div>
  );
}

function ThumbBoarding() {
  return (
    <div className="flex h-full w-full overflow-hidden rounded-md border border-neutral-800 bg-white">
      <div className="flex-1 p-1">
        <div className="flex items-center justify-between border-b border-[#12301D] pb-0.5">
          <span className="text-[5px] font-bold uppercase text-[#12301D]">Hotspot</span>
          <span className="rounded-full bg-[#12301D] px-1 text-[4px] text-white">Wi-Fi</span>
        </div>
        <div className="mt-0.5 flex gap-1.5 text-[4px] text-neutral-500">
          <span>Forfait</span><span>Durée</span><span>Prix</span>
        </div>
        <div className="font-mono text-[9px] font-extrabold tracking-widest text-neutral-900">A1B2C3</div>
      </div>
      <div className="flex w-8 flex-col items-center justify-center border-l border-dashed border-neutral-800 bg-neutral-100">
        <MiniQr size={4} seed={1} />
      </div>
    </div>
  );
}

function ThumbThermal() {
  return (
    <div className="flex h-full w-full justify-center">
      <div className="flex w-12 flex-col items-center gap-px bg-white px-1 py-1 font-mono shadow-sm">
        <span className="text-[5px] font-bold uppercase">Hotspot</span>
        <span className="w-full border-t border-dashed border-neutral-700" />
        <span className="text-[7px] font-bold tracking-widest">A1B2C3</span>
        <MiniQr size={3} seed={2} />
        <span className="w-full border-t border-dashed border-neutral-700" />
      </div>
    </div>
  );
}

function ThumbLabels() {
  return (
    <div className="grid h-full w-full grid-cols-3 gap-px bg-neutral-200 p-px">
      {Array.from({ length: 6 }).map((_, k) => (
        <div key={k} className="flex items-center gap-0.5 bg-white px-0.5">
          <MiniQr size={2.5} seed={k} />
          <span className="font-mono text-[5px] font-bold">x{k}9k</span>
        </div>
      ))}
    </div>
  );
}

export const TICKET_TEMPLATES: TicketTemplate[] = [
  {
    id: "stub",
    name: "Ticket à souche",
    description: "Bords perforés, QR à scanner, forfait et code en couleur, numéro de ticket",
    tags: ["QR Code", "Perforé", "Usage unique"],
    Thumbnail: ThumbStub,
    buildDocument: buildStub,
  },
  {
    id: "boarding",
    name: "Carte d'embarquement",
    description: "Forfait, durée et prix en champs, souche détachable avec le QR",
    tags: ["Souche", "QR Code", "Lisible"],
    Thumbnail: ThumbBoarding,
    buildDocument: buildBoarding,
  },
  {
    id: "thermal",
    name: "Reçu thermique 58 mm",
    description: "Pour imprimante de caisse : un ticket par bande, QR et mode d'emploi",
    tags: ["Imprimante 58 mm", "Guichet", "N&B"],
    Thumbnail: ThumbThermal,
    buildDocument: buildThermal,
  },
  {
    id: "labels",
    name: "Planche d'étiquettes",
    description: "Autocollants A4 de 3 × 8 (70 × 37 mm), QR et code, à coller sur des cartes",
    tags: ["Autocollant", "24 par page", "QR Code"],
    Thumbnail: ThumbLabels,
    buildDocument: buildLabels,
  },
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
