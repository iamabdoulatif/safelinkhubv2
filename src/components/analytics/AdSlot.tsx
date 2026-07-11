// Emplacement publicitaire AdSense réutilisable, à déposer sur N'IMPORTE QUELLE
// page SERVEUR (landing, pages de contenu, etc.). Composant serveur : il lit
// lui-même les réglages Marketing, applique le gating (AdSense activé + client
// + slot) et rend l'unité (BlogAd, "use client"). Ne rend RIEN si AdSense n'est
// pas configuré/activé — donc sans danger à laisser en place.
//
// Utilisation :
//   <AdSlot />                      -> unité par défaut (slot des réglages)
//   <AdSlot slot="1234567890" />    -> une unité AdSense précise (recommandé :
//                                      un slot distinct par emplacement, créé
//                                      dans AdSense > Annonces > Par unité)
//   <AdSlot className="my-8" />     -> espacement/positionnement personnalisé
//
// Ne peut être utilisé que dans un composant SERVEUR (il est async). Dans un
// composant client, passez plutôt par <BlogAd client=… slot=… /> directement.

import { getMarketingSettings } from "@/lib/marketing/queries";
import BlogAd from "./BlogAd";

export default async function AdSlot({
  slot,
  className,
}: {
  slot?: string;
  className?: string;
}) {
  const { adsenseEnabled, adsenseClientId, adsenseSlotId } = await getMarketingSettings();
  const effectiveSlot = slot ?? adsenseSlotId;
  if (!adsenseEnabled || !adsenseClientId || !effectiveSlot) return null;

  return (
    <div className={className ?? "mx-auto w-full max-w-5xl px-4 py-8"}>
      <BlogAd client={adsenseClientId} slot={effectiveSlot} />
    </div>
  );
}
