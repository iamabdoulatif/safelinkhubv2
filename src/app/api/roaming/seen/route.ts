import { after, type NextRequest } from "next/server";
import { verifyRouterKey } from "@/lib/roaming/webhook-secret";
import { propagateRoamingMac } from "@/lib/roaming/mac-propagate";

// Webhook appelé PAR LE ROUTEUR (script on-login du profil roaming) à chaque
// connexion d'un code : signale (routeur, code, MAC). On authentifie via la clé
// dérivée par routeur, on répond IMMÉDIATEMENT (contrainte Cloudflare ~100 s),
// et on lie le MAC sur les zones sœurs en tâche de fond (after) — la
// propagation re-vérifie la session en live avant d'agir (anti-usurpation).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = await request.text().catch(() => "");
  const params = new URLSearchParams(body);
  const routerId = params.get("r") ?? "";
  const key = params.get("k");
  const username = params.get("u") ?? "";
  const mac = params.get("m") ?? "";

  // Clé invalide → 204 (pas d'info à un appelant non authentifié), aucune action.
  if (!verifyRouterKey(routerId, key)) {
    return new Response(null, { status: 204 });
  }

  // Propagation détachée : le login du client n'attend pas nos allers-retours
  // routeur. Ne jamais laisser une erreur remonter (le on-login est en :do{}).
  after(async () => {
    try {
      await propagateRoamingMac({ reporterRouterId: routerId, username, mac });
    } catch {
      /* best-effort : un échec de propagation ne casse jamais le login client */
    }
  });

  return new Response(null, { status: 202 });
}
