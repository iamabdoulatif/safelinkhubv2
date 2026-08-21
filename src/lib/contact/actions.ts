"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { contactMessages } from "@/lib/db/schema";
import { getSession, isSuperAdmin } from "@/lib/auth/session";
import { enforcePublicSubmissionRateLimit } from "@/lib/public-rate-limit";

const MAX_MESSAGE_LENGTH = 5000;

function contactError(locale: "fr" | "en", key: "required" | "email" | "length" | "rateLimit") {
  const messages = {
    fr: {
      required: "Le nom, l'email et le message sont requis.",
      email: "Adresse email invalide.",
      length: `Le message ne peut pas dépasser ${MAX_MESSAGE_LENGTH} caractères.`,
      rateLimit: "Trop de soumissions récentes. Réessayez plus tard.",
    },
    en: {
      required: "Name, email and message are required.",
      email: "Please enter a valid email address.",
      length: `Your message cannot exceed ${MAX_MESSAGE_LENGTH} characters.`,
      rateLimit: "Too many recent submissions. Please try again later.",
    },
  } as const;
  return messages[locale][key];
}

/** Action publique — le formulaire /contact est ouvert aux visiteurs
 * anonymes, donc pas de session requise. Le champ caché "website" sert de
 * honeypot anti-spam : rempli uniquement par les bots, on répond succès
 * sans rien enregistrer. */
export async function submitContactMessage(_prevState: unknown, formData: FormData) {
  const locale = formData.get("locale") === "en" ? "en" : "fr";
  if (String(formData.get("website") ?? "").trim()) {
    return { success: true };
  }

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const subject = String(formData.get("subject") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();

  if (!name || !email || !message) {
    return { error: contactError(locale, "required") };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: contactError(locale, "email") };
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return { error: contactError(locale, "length") };
  }
  const rateLimit = await enforcePublicSubmissionRateLimit("contact");
  if (!rateLimit.allowed) return { error: contactError(locale, "rateLimit") };

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
