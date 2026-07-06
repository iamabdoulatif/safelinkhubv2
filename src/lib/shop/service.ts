// Lecture de la boutique — module "plain", importé par les server components.

import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { products } from "@/lib/db/schema";

export type ProductRow = typeof products.$inferSelect;

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
