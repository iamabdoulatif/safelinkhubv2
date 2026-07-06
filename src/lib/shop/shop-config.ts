// Config de la boutique — module "plain" (pas de "use server") : importable
// côté client (catalogue, formulaire) et serveur (actions).

export { formatFcfa, buildWhatsappLink } from "@/lib/billing/auto-setup-gate-config";

export const PRODUCT_CATEGORIES = [
  "Routeurs",
  "Antennes",
  "Switchs",
  "Onduleurs",
  "Accessoires",
  "Câbles",
] as const;

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

/** Message WhatsApp pré-rempli pour commander un produit. */
export function buildProductOrderMessage(opts: {
  productName: string;
  priceFcfa: number;
  color: string | null;
  buyerName: string;
  buyerEmail: string;
}): string {
  return [
    "*Commande boutique — SafeLinkHub*",
    `Produit : ${opts.productName}`,
    `Prix : ${opts.priceFcfa.toLocaleString("fr-FR")} FCFA`,
    ...(opts.color ? [`Couleur : ${opts.color}`] : []),
    `Client : ${opts.buyerName} (${opts.buyerEmail})`,
  ].join("\n");
}
