"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { contactMessages } from "@/lib/db/schema";
import { getSession, isSuperAdmin } from "@/lib/auth/session";
import { enforcePublicSubmissionRateLimit } from "@/lib/public-rate-limit";

const MAX_MESSAGE_LENGTH = 5000;

/** Action publique — le formulaire /contact est ouvert aux visiteurs
 * anonymes, donc pas de session requise. Le champ caché "website" sert de
 * honeypot anti-spam : rempli uniquement par les bots, on répond succès
 * sans rien enregistrer. */
export async function submitContactMessage(_prevState: unknown, formData: FormData) {
  if (String(formData.get("website") ?? "").trim()) {
    return { success: true };
  }

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const subject = String(formData.get("subject") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();

  if (!name || !email || !message) {
    return { error: "Le nom, l'email et le message sont requis." };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Adresse email invalide." };
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return { error: `Le message ne peut pas dépasser ${MAX_MESSAGE_LENGTH} caractères.` };
  }
  const rateLimit = await enforcePublicSubmissionRateLimit("contact");
  if (!rateLimit.allowed) return { error: rateLimit.error };

  const db = getDb();
  await db.insert(contactMessages).values({
    name: name.slice(0, 200),
    email: email.slice(0, 320),
    subject: subject ? subject.slice(0, 300) : null,
    message,
  });

  revalidatePath("/admin/contact");
  return { success: true };
}

async function requireSuperAdminSession() {
  const session = await getSession();
  if (!session || !isSuperAdmin(session.role)) return null;
  return session;
}

export async function updateContactMessageStatus(formData: FormData) {
  const session = await requireSuperAdminSession();
  if (!session) return;

  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!id || !["new", "read", "archived"].includes(status)) return;

  const db = getDb();
  await db
    .update(contactMessages)
    .set({ status })
    .where(eq(contactMessages.id, id));

  revalidatePath("/admin/contact");
}

export async function deleteContactMessage(formData: FormData) {
  const session = await requireSuperAdminSession();
  if (!session) return;

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const db = getDb();
  await db.delete(contactMessages).where(eq(contactMessages.id, id));

  revalidatePath("/admin/contact");
}
