// Statut d'un produit dérivé de son stock / sa date — fonctions pures,
// réutilisables et testables, découplées de l'UI. Utilisé par les cartes,
// le quick-view et (plus tard) la fiche produit.

export type AvailabilityTone = "ok" | "low" | "out";

export type Availability = {
  tone: AvailabilityTone;
  label: string;
};

/** Seuil « stock faible » (au-delà : "En stock", en-dessous : compte affiché). */
export const LOW_STOCK_THRESHOLD = 5;

export function availabilityOf(stockQuantity: number): Availability {
  if (stockQuantity <= 0) return { tone: "out", label: "Rupture de stock" };
  if (stockQuantity <= LOW_STOCK_THRESHOLD)
    return { tone: "low", label: `Plus que ${stockQuantity} en stock` };
  return { tone: "ok", label: "En stock" };
}

/** Fenêtre pendant laquelle un produit porte le badge « Nouveau ». */
export const NEW_WINDOW_DAYS = 21;

export function isNewProduct(createdAt: Date | string, now: number = Date.now()): boolean {
  const created = createdAt instanceof Date ? createdAt.getTime() : new Date(createdAt).getTime();
  return Number.isFinite(created) && now - created < NEW_WINDOW_DAYS * 86_400_000;
}
