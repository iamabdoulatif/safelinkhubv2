// Marketing → Pixels & Analytics — réservé au superadmin. Configure les tags
// de suivi (Meta, GA4, GTM, TikTok) injectés dans le site public et l'AdSense
// affiché sur le blog.

import { redirect } from "next/navigation";
import { Megaphone } from "lucide-react";
import { getSession, isSuperAdmin } from "@/lib/auth/session";
import { readMarketingSettings } from "@/lib/marketing/queries";
import MarketingForm from "./MarketingForm";
import SocialSharingForm from "./SocialSharingForm";
import { readShareSettingsForForm } from "@/lib/social/share";

export default async function MarketingPage() {
  const session = await getSession();
  if (!isSuperAdmin(session?.role)) redirect("/admin");

  const [settings, share] = await Promise.all([
    readMarketingSettings(),
    readShareSettingsForForm(),
  ]);

  return (
    <div className="mx-auto max-w-3xl animate-fade-in-up">
      <div className="flex items-center gap-2">
        <Megaphone className="h-5 w-5 text-ink" />
        <h1 className="text-2xl font-bold text-ink">Pixels &amp; Analytics</h1>
      </div>
      <p className="mt-1 text-sm text-ink-soft">
        Identifiants de suivi injectés dans le site public (landing, blog)
        et régie AdSense pour le blog. Laissez un champ vide pour désactiver le tag
        correspondant.
      </p>

      <MarketingForm settings={settings} />

      <div className="mt-8">
        <SocialSharingForm {...share} />
      </div>
    </div>
  );
}
