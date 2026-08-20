"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { marketingSettings } from "@/lib/db/schema";
import { encryptSecret } from "@/lib/mikrotik/crypto";
import { getSession, isSuperAdmin } from "@/lib/auth/session";

type Result = { success: true } | { error: string };

const clean = (v: FormDataEntryValue | null) => String(v ?? "").trim();

/**
 * Enregistre les identifiants de diffusion.
 *
 * RÈGLE DES SECRETS : un champ de jeton laissé VIDE signifie « inchangé », pas
 * « efface ». Sans cela, rouvrir les réglages pour corriger une faute de frappe
 * dans l'identifiant de salon effacerait le jeton au passage — il n'est jamais
 * réaffiché, puisqu'on ne renvoie pas un secret au navigateur. Pour retirer un
 * jeton, il faut cocher explicitement sa case « effacer ».
 */
export async function updateSocialSharing(_prev: unknown, formData: FormData): Promise<Result> {
  const session = await getSession();
  if (!session || !isSuperAdmin(session.role)) {
    return { error: "Accès réservé au superadmin." };
  }

  const telegramChatId = clean(formData.get("telegramChatId"));
  const facebookPageId = clean(formData.get("facebookPageId"));
  const telegramBotToken = clean(formData.get("telegramBotToken"));
  const facebookPageToken = clean(formData.get("facebookPageToken"));
  const clearTelegram = formData.get("clearTelegramToken") === "on";
  const clearFacebook = formData.get("clearFacebookToken") === "on";

  // Un identifiant de salon Telegram est soit numérique (`-1001234567890`),
  // soit un nom public (`@ma_chaine`). Le refuser tôt évite un échec d'envoi
  // silencieux une semaine plus tard.
  if (telegramChatId && !/^(-?\d{5,20}|@[A-Za-z][A-Za-z0-9_]{4,31})$/.test(telegramChatId)) {
    return { error: "Identifiant Telegram invalide : attendu -1001234567890 ou @nom_du_canal." };
  }
  if (facebookPageId && !/^\d{5,25}$/.test(facebookPageId)) {
    return { error: "L'identifiant de page Facebook doit être numérique." };
  }

  const values: Record<string, unknown> = {
    telegramChatId: telegramChatId || null,
    facebookPageId: facebookPageId || null,
    updatedAt: new Date(),
  };
  if (clearTelegram) values.telegramBotToken = null;
  else if (telegramBotToken) values.telegramBotToken = encryptSecret(telegramBotToken);
  if (clearFacebook) values.facebookPageToken = null;
  else if (facebookPageToken) values.facebookPageToken = encryptSecret(facebookPageToken);

  const db = getDb();
  const [existing] = await db.select({ id: marketingSettings.id }).from(marketingSettings).limit(1);
  if (existing) {
    await db.update(marketingSettings).set(values).where(eq(marketingSettings.id, existing.id));
  } else {
    await db.insert(marketingSettings).values(values as typeof marketingSettings.$inferInsert);
  }

  revalidatePath("/admin/marketing");
  return { success: true };
}
