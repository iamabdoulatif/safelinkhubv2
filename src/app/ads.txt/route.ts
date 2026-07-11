// Sert https://<domaine>/ads.txt pour Google AdSense. AdSense exige ce fichier
// à la racine du domaine (norme IAB "Authorized Digital Sellers") pour autoriser
// la vente d'espaces publicitaires — sans lui, AdSense signale « ads.txt
// introuvable » et bride la diffusion. Le contenu est DÉRIVÉ du client AdSense
// configuré dans les réglages Marketing (superadmin) : une seule source de
// vérité, mis à jour automatiquement si le client change. f08c47fec0942fa0 est
// l'ID d'autorité de certification de Google (constant pour tous les éditeurs).

import { getMarketingSettings } from "@/lib/marketing/queries";

export async function GET() {
  const { adsenseClientId } = await getMarketingSettings();
  if (!adsenseClientId) {
    // Pas encore de client AdSense : rien d'autorisé à déclarer.
    return new Response("# ads.txt : aucun client AdSense configuré.\n", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  // ads.txt attend l'identifiant "pub-…" ; le client AdSense est "ca-pub-…".
  const publisherId = adsenseClientId.replace(/^ca-/i, "");
  const body = `google.com, ${publisherId}, DIRECT, f08c47fec0942fa0\n`;

  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}
