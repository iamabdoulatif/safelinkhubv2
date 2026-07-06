"use server";

// Mutation des réglages marketing (pixels & analytics) — réservée au
// superadmin. Singleton : on met à jour la ligne existante, sinon on l'insère.

import { eq } from "drizzle-orm";
import { revalidatePath, revalidateTag } from "next/cache";
import { getDb } from "@/lib/db";
import { marketingSettings } from "@/lib/db/schema";
import { getSession, isSuperAdmin } from "@/lib/auth/session";
import { MARKETING_SETTINGS_TAG } from "./queries";

type Result = { success: true } | { error: string };

/** Nettoyage : trim + vide → null. */
function clean(v: FormDataEntryValue | null): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
}

export async function updateMarketingSettings(formData: FormData): Promise<Result> {
  const session = await getSession();
  if (!isSuperAdmin(session?.role)) return { error: "Réservé au superadmin." };

  const values = {
    metaPixelId: clean(formData.get("metaPixelId")),
    ga4MeasurementId: clean(formData.get("ga4MeasurementId")),
    gtmId: clean(formData.get("gtmId")),
    tiktokPixelId: clean(formData.get("tiktokPixelId")),
    adsenseClientId: clean(formData.get("adsenseClientId")),
    adsenseSlotId: clean(formData.get("adsenseSlotId")),
    adsenseEnabled: formData.get("adsenseEnabled") === "on",
    updatedAt: new Date(),
  };

  const db = getDb();
  const [existing] = await db
    .select({ id: marketingSettings.id })
    .from(marketingSettings)
    .limit(1);

  if (existing) {
    await db
      .update(marketingSettings)
      .set(values)
      .where(eq(marketingSettings.id, existing.id));
  } else {
    await db.insert(marketingSettings).values(values);
  }

  // Invalide le cache des lectures publiques (root layout, blog) + la page.
  // Next 16 : revalidateTag exige un profil de fraîcheur ("max" = SWR).
  revalidateTag(MARKETING_SETTINGS_TAG, "max");
  revalidatePath("/", "layout");
  return { success: true };
}
