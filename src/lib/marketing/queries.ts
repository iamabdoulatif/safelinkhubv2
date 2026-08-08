// Lecture des réglages marketing (pixels & analytics) — hors "use server"
// pour être importable par les server components (dont le root layout).
//
// Le résultat est mis en cache (tag "marketing-settings") pour que l'injection
// des tags dans le <head> ne force PAS le rendu dynamique de tout le site :
// la landing et le blog restent statiques / cachés au bord (Cloudflare). La
// sauvegarde côté superadmin invalide ce cache via revalidateTag.

import { unstable_cache } from "next/cache";
import { getDb } from "@/lib/db";
import { marketingSettings } from "@/lib/db/schema";

export const MARKETING_SETTINGS_TAG = "marketing-settings";

export type MarketingSettings = {
  metaPixelId: string | null;
  ga4MeasurementId: string | null;
  gtmId: string | null;
  tiktokPixelId: string | null;
  adsenseClientId: string | null;
  adsenseSlotId: string | null;
  adsenseEnabled: boolean;
  communityYoutubeUrl: string | null;
  communityTelegramUrl: string | null;
  communityWhatsappUrl: string | null;
};

const EMPTY: MarketingSettings = {
  metaPixelId: null,
  ga4MeasurementId: null,
  gtmId: null,
  tiktokPixelId: null,
  adsenseClientId: null,
  adsenseSlotId: null,
  adsenseEnabled: false,
  communityYoutubeUrl: null,
  communityTelegramUrl: null,
  communityWhatsappUrl: null,
};

/** Lecture directe (non cachée) — utilisée par la page d'admin qui doit voir
 * la valeur fraîche juste après sauvegarde. Renvoie des scalaires purs. */
export async function readMarketingSettings(): Promise<MarketingSettings> {
  if (!process.env.DATABASE_URL) return EMPTY;

  try {
    return await selectMarketingSettings();
  } catch (err) {
    // Base injoignable, ou SCHÉMA EN RETARD sur le code. Ce second cas a
    // cassé la CI pendant quatre jours : le build prérend des pages publiques,
    // la base du secret GitHub n'avait pas reçu la migration des liens
    // communautaires, et un `column does not exist` a tué chaque build.
    //
    // Des pixels d'analytics absents ne valent pas un déploiement bloqué :
    // on dégrade en réglages vides, comme lorsqu'aucune DATABASE_URL n'est
    // définie. Même garde-fou que la page sauvegardes et la carte de
    // parrainage, qui tolèrent déjà l'ordre migration/déploiement.
    console.warn(
      "[marketing] réglages illisibles, rendu sans tags analytics :",
      err instanceof Error ? err.message : String(err),
    );
    return EMPTY;
  }
}

async function selectMarketingSettings(): Promise<MarketingSettings> {
  const db = getDb();
  const [row] = await db
    .select({
      metaPixelId: marketingSettings.metaPixelId,
      ga4MeasurementId: marketingSettings.ga4MeasurementId,
      gtmId: marketingSettings.gtmId,
      tiktokPixelId: marketingSettings.tiktokPixelId,
      adsenseClientId: marketingSettings.adsenseClientId,
      adsenseSlotId: marketingSettings.adsenseSlotId,
      adsenseEnabled: marketingSettings.adsenseEnabled,
      communityYoutubeUrl: marketingSettings.communityYoutubeUrl,
      communityTelegramUrl: marketingSettings.communityTelegramUrl,
      communityWhatsappUrl: marketingSettings.communityWhatsappUrl,
    })
    .from(marketingSettings)
    .limit(1);
  return row ?? EMPTY;
}

/** Version cachée pour le rendu du site public (root layout, blog). */
export const getMarketingSettings = unstable_cache(
  readMarketingSettings,
  ["marketing-settings"],
  { tags: [MARKETING_SETTINGS_TAG] },
);
