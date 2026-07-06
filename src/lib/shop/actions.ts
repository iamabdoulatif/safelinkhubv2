"use server";

// Actions de la boutique. Les mutations (créer/modifier/supprimer) sont
// réservées au superadmin ; le catalogue est en lecture pour tous les admins.

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { products } from "@/lib/db/schema";
import { getSession, isSuperAdmin } from "@/lib/auth/session";
import { uploadPaymentProof } from "@/lib/billing/manual-payment";
import { getManualPaymentContact } from "@/lib/billing/manual-payment";
import { PRODUCT_CATEGORIES, COLOR_PALETTE } from "./shop-config";

type MutationResult = { success: true; id: string } | { error: string };

function parseColors(raw: FormDataEntryValue | null): string[] {
  if (typeof raw !== "string" || !raw) return [];
  const allowed = new Set(COLOR_PALETTE.map((c) => c.name));
  return raw
    .split(",")
    .map((c) => c.trim())
    .filter((c) => allowed.has(c));
}

async function readProductForm(formData: FormData): Promise<
  | {
      values: {
        name: string;
        description: string | null;
        priceFcfa: number;
        stockQuantity: number;
        colors: string[];
        category: string | null;
        brand: string | null;
        status: string;
      };
      imageFile: FormDataEntryValue | null;
    }
  | { error: string }
> {
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const priceFcfa = Number(formData.get("priceFcfa"));
  const stockQuantity = Number(formData.get("stockQuantity"));
  const category = String(formData.get("category") ?? "").trim() || null;
  const brand = String(formData.get("brand") ?? "").trim() || null;
  const status = String(formData.get("status") ?? "active") === "hidden" ? "hidden" : "active";

  if (!name) return { error: "Le nom du produit est requis." };
  if (!Number.isInteger(priceFcfa) || priceFcfa < 0) return { error: "Prix invalide." };
  if (!Number.isInteger(stockQuantity) || stockQuantity < 0) return { error: "Quantité invalide." };
  if (category && !PRODUCT_CATEGORIES.includes(category as (typeof PRODUCT_CATEGORIES)[number])) {
    return { error: "Catégorie invalide." };
  }

  return {
    values: {
      name,
      description,
      priceFcfa,
      stockQuantity,
      colors: parseColors(formData.get("colors")),
      category,
      brand,
      status,
    },
    imageFile: formData.get("image"),
  };
}

export async function createProduct(formData: FormData): Promise<MutationResult> {
  const session = await getSession();
  if (!isSuperAdmin(session?.role)) return { error: "Réservé au superadmin." };

  const parsed = await readProductForm(formData);
  if ("error" in parsed) return parsed;

  const uploaded = await uploadPaymentProof(parsed.imageFile, "products/image");
  if (uploaded.tooLarge) return { error: "L'image dépasse 5 Mo." };

  const db = getDb();
  const [row] = await db
    .insert(products)
    .values({ ...parsed.values, imageUrl: uploaded.url })
    .returning();
  revalidatePath("/admin/shop");
  revalidatePath("/admin/shop/manage");
  return { success: true, id: row.id };
}

export async function updateProduct(id: string, formData: FormData): Promise<MutationResult> {
  const session = await getSession();
  if (!isSuperAdmin(session?.role)) return { error: "Réservé au superadmin." };

  const parsed = await readProductForm(formData);
  if ("error" in parsed) return parsed;

  // Nouvelle image seulement si un fichier est fourni — sinon on garde l'URL
  // existante.
  const uploaded = await uploadPaymentProof(parsed.imageFile, "products/image");
  if (uploaded.tooLarge) return { error: "L'image dépasse 5 Mo." };

  const db = getDb();
  const [row] = await db
    .update(products)
    .set({
      ...parsed.values,
      ...(uploaded.url ? { imageUrl: uploaded.url } : {}),
      updatedAt: new Date(),
    })
    .where(eq(products.id, id))
    .returning();
  if (!row) return { error: "Produit introuvable." };
  revalidatePath("/admin/shop");
  revalidatePath("/admin/shop/manage");
  return { success: true, id: row.id };
}

export async function deleteProduct(id: string): Promise<{ success: true } | { error: string }> {
  const session = await getSession();
  if (!isSuperAdmin(session?.role)) return { error: "Réservé au superadmin." };
  const db = getDb();
  await db.delete(products).where(eq(products.id, id));
  revalidatePath("/admin/shop");
  revalidatePath("/admin/shop/manage");
  return { success: true };
}

/** Numéro WhatsApp de la boutique (pour les liens de commande côté client). */
export async function getShopWhatsappNumber(): Promise<string> {
  return getManualPaymentContact().whatsappNumber;
}
