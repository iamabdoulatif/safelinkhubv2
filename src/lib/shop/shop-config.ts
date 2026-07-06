// Config de la boutique — module "plain" (pas de "use server") : importable
// côté client (catalogue, formulaire) et serveur (actions).

export { formatFcfa, buildWhatsappLink } from "@/lib/billing/auto-setup-gate-config";

// Les catégories de la boutique sont désormais gérées en base
// (table product_categories) et éditables par le superadmin — voir
// lib/shop/service.ts (listCategories) et lib/shop/actions.ts.

// Palette proposée pour les couleurs d'un produit (le superadmin coche celles
// disponibles ; l'acheteur en choisit une à la commande).
export const COLOR_PALETTE: { name: string; hex: string }[] = [
  { name: "Noir", hex: "#1C1917" },
  { name: "Blanc", hex: "#F5F5F4" },
  { name: "Gris", hex: "#9CA3AF" },
  { name: "Bleu", hex: "#2563EB" },
  { name: "Rouge", hex: "#DC2626" },
  { name: "Vert", hex: "#16A34A" },
  { name: "Or", hex: "#D4AF37" },
];

export function colorHex(name: string): string {
  return COLOR_PALETTE.find((c) => c.name.toLowerCase() === name.toLowerCase())?.hex ?? "#9CA3AF";
}

// Badges marketing configurables depuis l'admin (les badges "Nouveau" et
// "Stock faible" sont dérivés automatiquement, cf. product-status.ts).
// `tone` mappe une couleur token pour le rendu.
export const BADGE_CATALOG = [
  { id: "promo", label: "Promotion", tone: "err" },
  { id: "bestseller", label: "Best Seller", tone: "brand" },
  { id: "fast_shipping", label: "Livraison rapide", tone: "ok" },
  { id: "warranty", label: "Garantie", tone: "ink" },
] as const;

export type BadgeId = (typeof BADGE_CATALOG)[number]["id"];

export function badgeMeta(id: string) {
  return BADGE_CATALOG.find((b) => b.id === id) ?? null;
}

/** Slugify partagé (fiche produit, blog) — ASCII, minuscules, tirets. */
export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** Message WhatsApp pré-rempli pour commander un produit. Les infos client
 * sont incluses seulement si connues (commande possible sans connexion). */
export function buildProductOrderMessage(opts: {
  productName: string;
  priceFcfa: number;
  color: string | null;
  buyerName?: string;
  buyerEmail?: string;
}): string {
  const buyer = [opts.buyerName, opts.buyerEmail].filter(Boolean).join(" ");
  return [
    "*Commande boutique — SafeLinkHub*",
    `Produit : ${opts.productName}`,
    `Prix : ${opts.priceFcfa.toLocaleString("fr-FR")} FCFA`,
    ...(opts.color ? [`Couleur : ${opts.color}`] : []),
    ...(buyer ? [`Client : ${buyer}`] : []),
  ].join("\n");
}

/** Message WhatsApp pour commander un panier complet. */
export function buildCartOrderMessage(opts: {
  items: { name: string; priceFcfa: number; color: string | null; quantity: number }[];
  totalFcfa: number;
  buyerName?: string;
  buyerEmail?: string;
}): string {
  const buyer = [opts.buyerName, opts.buyerEmail].filter(Boolean).join(" ");
  const lines = opts.items.map(
    (i, n) =>
      `${n + 1}. ${i.name}${i.color ? ` (${i.color})` : ""} × ${i.quantity} — ${(
        i.priceFcfa * i.quantity
      ).toLocaleString("fr-FR")} FCFA`,
  );
  return [
    "*Commande boutique — SafeLinkHub*",
    ...lines,
    `Total : ${opts.totalFcfa.toLocaleString("fr-FR")} FCFA`,
    ...(buyer ? [`Client : ${buyer}`] : []),
  ].join("\n");
}
