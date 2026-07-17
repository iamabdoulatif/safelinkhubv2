"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { testimonials } from "@/lib/db/schema";
import { getSession, isSuperAdmin } from "@/lib/auth/session";
import { enforcePublicSubmissionRateLimit } from "@/lib/public-rate-limit";

const MAX_QUOTE = 600;

/**
 * Action PUBLIQUE — le formulaire de témoignage sur la landing est ouvert aux
 * visiteurs anonymes. Champ caché "website" = honeypot anti-spam (rempli par
 * les bots uniquement → succès sans rien enregistrer). Le témoignage est créé
 * en "pending" ; il n'apparaît sur la landing qu'après approbation superadmin.
 */
export async function submitTestimonial(_prevState: unknown, formData: FormData) {
  if (String(formData.get("website") ?? "").trim()) {
    return { success: true };
  }

  const name = String(formData.get("name") ?? "").trim();
  const company = String(formData.get("company") ?? "").trim();
  const role = String(formData.get("role") ?? "").trim();
  const quote = String(formData.get("quote") ?? "").trim();
  const ratingRaw = Number(formData.get("rating") ?? 0);

  if (!name || !quote) {
    return { error: "Votre nom et votre témoignage sont requis." };
  }
  if (quote.length > MAX_QUOTE) {
    return { error: `Le témoignage ne peut pas dépasser ${MAX_QUOTE} caractères.` };
  }
  const rating =
    Number.isInteger(ratingRaw) && ratingRaw >= 1 && ratingRaw <= 5 ? ratingRaw : null;
  const rateLimit = await enforcePublicSubmissionRateLimit("testimonial");
  if (!rateLimit.allowed) return { error: rateLimit.error };

  const db = getDb();
  await db.insert(testimonials).values({
    name: name.slice(0, 120),
    company: company ? company.slice(0, 160) : null,
    role: role ? role.slice(0, 120) : null,
    quote,
    rating,
    status: "pending",
  });

  revalidatePath("/admin/testimonials");
  return { success: true };
}

async function requireSuperAdminSession() {
  const session = await getSession();
  if (!session || !isSuperAdmin(session.role)) return null;
  return session;
}

export async function moderateTestimonial(formData: FormData) {
  const session = await requireSuperAdminSession();
  if (!session) return;

  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!id || !["pending", "approved", "hidden"].includes(status)) return;

  const db = getDb();
  await db.update(testimonials).set({ status }).where(eq(testimonials.id, id));

  revalidatePath("/admin/testimonials");
  revalidatePath("/");
}

export async function deleteTestimonial(formData: FormData) {
  const session = await requireSuperAdminSession();
  if (!session) return;

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const db = getDb();
  await db.delete(testimonials).where(eq(testimonials.id, id));

  revalidatePath("/admin/testimonials");
  revalidatePath("/");
}
