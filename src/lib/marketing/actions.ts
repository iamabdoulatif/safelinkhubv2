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

function validateMarketingId(
  value: string | null,
  label: string,
  pattern: RegExp,
): { value: string | null } | { error: string } {
  if (!value) return { value: null };
  if (!pattern.test(value)) return { error: `${label} invalide.` };
  return { value };
}

export async function updateMarketingSettings(formData: FormData): Promise<Result> {
  const session = await getSession();
  if (!isSuperAdmin(session?.role)) return { error: "Réservé au superadmin." };

  const metaPixelId = validateMarketingId(clean(formData.get("metaPixelId")), "Meta Pixel ID", /^\d{5,30}$/);
  if ("error" in metaPixelId) return metaPixelId;
  const ga4MeasurementId = validateMarketingId(
    clean(formData.get("ga4MeasurementId")),
    "GA4 Measurement ID",
    /^G-[A-Z0-9]{4,20}$/i,
  );
  if ("error" in ga4MeasurementId) return ga4MeasurementId;
  const gtmId = validateMarketingId(clean(formData.get("gtmId")), "Google Tag Manager ID", /^GTM-[A-Z0-9]{4,20}$/i);
  if ("error" in gtmId) return gtmId;
  const tiktokPixelId = validateMarketingId(
    clean(formData.get("tiktokPixelId")),
    "TikTok Pixel ID",
    /^[A-Z0-9]{8,64}$/i,
  );
  if ("error" in tiktokPixelId) return tiktokPixelId;
  const adsenseClientId = validateMarketingId(
    clean(formData.get("adsenseClientId")),
    "AdSense client ID",
    /^ca-pub-\d{12,24}$/i,
  );
  if ("error" in adsenseClientId) return adsenseClientId;
  const adsenseSlotId = validateMarketingId(
    clean(formData.get("adsenseSlotId")),
    "AdSense slot ID",
    /^\d{4,24}$/,
  );
  if ("error" in adsenseSlotId) return adsenseSlotId;

  const values = {
    metaPixelId: metaPixelId.value,
    ga4MeasurementId: ga4MeasurementId.value,
    gtmId: gtmId.value,
    tiktokPixelId: tiktokPixelId.value,
    adsenseClientId: adsenseClientId.value,
    adsenseSlotId: adsenseSlotId.value,
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
