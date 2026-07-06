"use server";

// Actions de la boutique. Les mutations (créer/modifier/supprimer) sont
// réservées au superadmin ; le catalogue est en lecture pour tous les admins.

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { products, productCategories } from "@/lib/db/schema";
import { getSession, isSuperAdmin } from "@/lib/auth/session";
import { uploadPaymentProof } from "@/lib/billing/manual-payment";
import { getManualPaymentContact } from "@/lib/billing/manual-payment";
import { BADGE_CATALOG, COLOR_PALETTE, slugify } from "./shop-config";

type MutationResult = { success: true; id: string } | { error: string };

const IMAGE_REF = /^(\/|https:\/\/)/;

function parseColors(raw: FormDataEntryValue | null): string[] {
  if (typeof raw !== "string" || !raw) return [];
  const allowed = new Set(COLOR_PALETTE.map((c) => c.name));
  return raw
    .split(",")
    .map((c) => c.trim())
    .filter((c) => allowed.has(c));
}

/** URLs de galerie : une par ligne, chemin (/…) ou https uniquement. */
function parseImageList(raw: FormDataEntryValue | null): string[] {
  if (typeof raw !== "string" || !raw) return [];
  return raw
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter((s) => s && IMAGE_REF.test(s));
}

function parseBadges(form: FormData): string[] {
  const allowed = new Set(BADGE_CATALOG.map((b) => b.id));
  return form
    .getAll("badges")
    .map((v) => String(v))
    .filter((v) => allowed.has(v as (typeof BADGE_CATALOG)[number]["id"]));
}

/** Specs : "Libellé: valeur" par ligne → [{label, value}]. */
function parseSpecs(raw: FormDataEntryValue | null): { label: string; value: string }[] {
  if (typeof raw !== "string" || !raw) return [];
  return raw
    .split("\n")
    .map((line) => {
      const idx = line.indexOf(":");
      if (idx === -1) return null;
      const label = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim();
      return label && value ? { label, value } : null;
    })
    .filter((x): x is { label: string; value: string } => x !== null)
    .slice(0, 30);
}

type ProductValues = {
  name: string;
  slug: string;
  description: string | null;
  priceFcfa: number;
  stockQuantity: number;
  colors: string[];
  images: string[];
  badges: string[];
  specs: { label: string; value: string }[];
  category: string | null;
  brand: string | null;
  status: string;
};

async function readProductForm(
  formData: FormData,
): Promise<
  | { values: ProductValues; imageFile: FormDataEntryValue | null; imageUrlText: string | null }
  | { error: string }
> {
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const priceFcfa = Number(formData.get("priceFcfa"));
  const stockQuantity = Number(formData.get("stockQuantity"));
  const category = String(formData.get("category") ?? "").trim() || null;
  const brand = String(formData.get("brand") ?? "").trim() || null;
  const status = String(formData.get("status") ?? "active") === "hidden" ? "hidden" : "active";
  const rawSlug = String(formData.get("slug") ?? "").trim();
  const imageUrlText = String(formData.get("imageUrlText") ?? "").trim() || null;

  if (!name) return { error: "Le nom du produit est requis." };
  if (!Number.isInteger(priceFcfa) || priceFcfa < 0) return { error: "Prix invalide." };
  if (!Number.isInteger(stockQuantity) || stockQuantity < 0) return { error: "Quantité invalide." };
  if (imageUrlText && !IMAGE_REF.test(imageUrlText)) {
    return { error: "L'URL de l'image principale doit être un chemin (/…) ou une URL https." };
  }

  const slug = slugify(rawSlug || name);
  if (!slug) return { error: "Impossible de générer un identifiant (slug) depuis le nom." };

  if (category) {
    const db = getDb();
    const [match] = await db
      .select({ name: productCategories.name })
      .from(productCategories)
      .where(eq(productCategories.name, category))
      .limit(1);
    if (!match) return { error: "Catégorie invalide." };
  }

  return {
    values: {
      name,
      slug,
      description,
      priceFcfa,
      stockQuantity,
      colors: parseColors(formData.get("colors")),
      images: parseImageList(formData.get("galleryUrls")),
      badges: parseBadges(formData),
      specs: parseSpecs(formData.get("specs")),
      category,
      brand,
      status,
    },
    imageFile: formData.get("image"),
    imageUrlText,
  };
}

/** Vérifie l'unicité du slug (hors produit courant en édition). */
async function slugTaken(slug: string, excludeId?: string): Promise<boolean> {
  const db = getDb();
  const [row] = await db
    .select({ id: products.id })
    .from(products)
    .where(excludeId ? and(eq(products.slug, slug), ne(products.id, excludeId)) : eq(products.slug, slug))
    .limit(1);
  return Boolean(row);
}

export async function createProduct(formData: FormData): Promise<MutationResult> {
  const session = await getSession();
  if (!isSuperAdmin(session?.role)) return { error: "Réservé au superadmin." };

  const parsed = await readProductForm(formData);
  if ("error" in parsed) return parsed;

  if (await slugTaken(parsed.values.slug)) {
    return { error: `L'identifiant « ${parsed.values.slug} » est déjà utilisé. Choisissez un autre slug.` };
  }

  const uploaded = await uploadPaymentProof(parsed.imageFile, "products/image");
  if (uploaded.tooLarge) return { error: "L'image dépasse 5 Mo." };
  const imageUrl = uploaded.url ?? parsed.imageUrlText;

  const db = getDb();
  const [row] = await db
    .insert(products)
    .values({ ...parsed.values, imageUrl })
    .returning();
  revalidateShop();
  return { success: true, id: row.id };
}

export async function updateProduct(id: string, formData: FormData): Promise<MutationResult> {
  const session = await getSession();
  if (!isSuperAdmin(session?.role)) return { error: "Réservé au superadmin." };

  const parsed = await readProductForm(formData);
  if ("error" in parsed) return parsed;

  if (await slugTaken(parsed.values.slug, id)) {
    return { error: `L'identifiant « ${parsed.values.slug} » est déjà utilisé. Choisissez un autre slug.` };
  }

  // Image principale : nouveau fichier > URL saisie > URL existante conservée.
  const uploaded = await uploadPaymentProof(parsed.imageFile, "products/image");
  if (uploaded.tooLarge) return { error: "L'image dépasse 5 Mo." };
  const newImageUrl = uploaded.url ?? parsed.imageUrlText;

  const db = getDb();
  const [row] = await db
    .update(products)
    .set({
      ...parsed.values,
      ...(newImageUrl ? { imageUrl: newImageUrl } : {}),
      updatedAt: new Date(),
    })
    .where(eq(products.id, id))
    .returning();
  if (!row) return { error: "Produit introuvable." };
  revalidateShop();
  if (row.slug) revalidatePath(`/boutique/${row.slug}`);
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

// ── Catégories (superadmin) ──────────────────────────────────────────────

type CategoryResult = { success: true; id: string } | { error: string };

function revalidateShop() {
  revalidatePath("/admin/shop");
  revalidatePath("/admin/shop/manage");
  revalidatePath("/boutique");
}

/** Crée une catégorie ; sa position la place en fin de liste. */
export async function createCategory(rawName: string): Promise<CategoryResult> {
  const session = await getSession();
  if (!isSuperAdmin(session?.role)) return { error: "Réservé au superadmin." };

  const name = rawName.trim();
  if (!name) return { error: "Le nom de la catégorie est requis." };

  const db = getDb();
  const [existing] = await db
    .select({ id: productCategories.id })
    .from(productCategories)
    .where(eq(productCategories.name, name))
    .limit(1);
  if (existing) return { error: "Cette catégorie existe déjà." };

  // Position = max(position) + 1 pour ajouter à la fin de la sidebar.
  const rows = await db
    .select({ position: productCategories.position })
    .from(productCategories);
  const nextPosition = rows.reduce((max, r) => Math.max(max, r.position), -1) + 1;

  const [row] = await db
    .insert(productCategories)
    .values({ name, position: nextPosition })
    .returning();
  revalidateShop();
  return { success: true, id: row.id };
}

/** Renomme une catégorie et propage le nouveau libellé aux produits liés. */
export async function renameCategory(id: string, rawName: string): Promise<CategoryResult> {
  const session = await getSession();
  if (!isSuperAdmin(session?.role)) return { error: "Réservé au superadmin." };

  const name = rawName.trim();
  if (!name) return { error: "Le nom de la catégorie est requis." };

  const db = getDb();
  const [current] = await db
    .select()
    .from(productCategories)
    .where(eq(productCategories.id, id))
    .limit(1);
  if (!current) return { error: "Catégorie introuvable." };

  if (name !== current.name) {
    const [clash] = await db
      .select({ id: productCategories.id })
      .from(productCategories)
      .where(eq(productCategories.name, name))
      .limit(1);
    if (clash) return { error: "Cette catégorie existe déjà." };

    await db
      .update(productCategories)
      .set({ name })
      .where(eq(productCategories.id, id));
    // Les produits référencent la catégorie par texte : on propage le renommage.
    await db
      .update(products)
      .set({ category: name, updatedAt: new Date() })
      .where(eq(products.category, current.name));
  }

  revalidateShop();
  return { success: true, id };
}

/** Supprime une catégorie ; les produits liés repassent à "sans catégorie". */
export async function deleteCategory(id: string): Promise<{ success: true } | { error: string }> {
  const session = await getSession();
  if (!isSuperAdmin(session?.role)) return { error: "Réservé au superadmin." };

  const db = getDb();
  const [current] = await db
    .select()
    .from(productCategories)
    .where(eq(productCategories.id, id))
    .limit(1);
  if (!current) return { error: "Catégorie introuvable." };

  await db
    .update(products)
    .set({ category: null, updatedAt: new Date() })
    .where(eq(products.category, current.name));
  await db.delete(productCategories).where(eq(productCategories.id, id));

  revalidateShop();
  return { success: true };
}
