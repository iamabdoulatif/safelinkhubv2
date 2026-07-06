// Lecture de la boutique — module "plain", importé par les server components.

import { and, asc, desc, eq, ne } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { products, productCategories } from "@/lib/db/schema";

export type ProductRow = typeof products.$inferSelect;
export type CategoryRow = typeof productCategories.$inferSelect;

/** Vue compacte d'un produit — pour "récemment consultés" et cartes légères. */
export type ProductMini = {
  id: string;
  slug: string | null;
  name: string;
  brand: string | null;
  priceFcfa: number;
  imageUrl: string | null;
};

/** Catégories de la boutique, ordonnées pour la sidebar du catalogue. */
export async function listCategories(): Promise<CategoryRow[]> {
  const db = getDb();
  return db
    .select()
    .from(productCategories)
    .orderBy(asc(productCategories.position), asc(productCategories.name));
}

/** Produits visibles au catalogue (actifs), récents d'abord. */
export async function listActiveProducts(): Promise<ProductRow[]> {
  const db = getDb();
  return db
    .select()
    .from(products)
    .where(eq(products.status, "active"))
    .orderBy(desc(products.createdAt));
}

/** Tous les produits (gestion superadmin). */
export async function listAllProducts(): Promise<ProductRow[]> {
  const db = getDb();
  return db.select().from(products).orderBy(desc(products.createdAt));
}

export async function getProduct(id: string): Promise<ProductRow | null> {
  const db = getDb();
  const [row] = await db.select().from(products).where(eq(products.id, id)).limit(1);
  return row ?? null;
}

/** Fiche produit publique : produit actif par slug. */
export async function getActiveProductBySlug(slug: string): Promise<ProductRow | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(products)
    .where(and(eq(products.slug, slug), eq(products.status, "active")))
    .limit(1);
  return row ?? null;
}

/** Produits similaires : même catégorie, actifs, hors produit courant. */
export async function listSimilarProducts(product: ProductRow, limit = 6): Promise<ProductRow[]> {
  if (!product.category) return [];
  const db = getDb();
  return db
    .select()
    .from(products)
    .where(
      and(
        eq(products.status, "active"),
        eq(products.category, product.category),
        ne(products.id, product.id),
      ),
    )
    .orderBy(desc(products.createdAt))
    .limit(limit);
}

/** Catalogue compact (actifs) — pour résoudre les "récemment consultés". */
export async function listActiveProductsMini(): Promise<ProductMini[]> {
  const db = getDb();
  return db
    .select({
      id: products.id,
      slug: products.slug,
      name: products.name,
      brand: products.brand,
      priceFcfa: products.priceFcfa,
      imageUrl: products.imageUrl,
    })
    .from(products)
    .where(eq(products.status, "active"))
    .orderBy(desc(products.createdAt));
}
