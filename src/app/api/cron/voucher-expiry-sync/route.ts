import { NextRequest } from "next/server";
import { reconcileVoucherExpiries } from "@/lib/vouchers/reconcile";
import { reconcilePortalOrders } from "@/lib/portal/reconcile";
import { retryAllPendingRoamingBindings } from "@/lib/roaming/pending-binding-retry";

export const maxDuration = 300;

/**
 * Décompte PARTAGÉ des vouchers multi-routeurs (voir reconcile.ts).
 *
 * À déclencher périodiquement (toutes les ~2-5 min). Sur Vercel : cron défini
 * dans vercel.json. En self-hosted (conteneur Docker safelinkhub.io, hors
 * Vercel), planifier un appel externe toutes les 2 min via crontab, p. ex. :
 *   curl -sS -H "Authorization: Bearer $CRON_SECRET" \
 *     https://safelinkhub.io/api/cron/voucher-expiry-sync
 *
 * Lit les commentaires d'expiration sur chaque routeur, fige la 1ʳᵉ connexion
 * en base et propage la même expiration à toutes les zones du ticket.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const [vouchers, portalOrders, roamingBindings] = await Promise.all([
      reconcileVoucherExpiries(),
      reconcilePortalOrders(),
      retryAllPendingRoamingBindings(),
    ]);
    return Response.json({ vouchers, portalOrders, roamingBindings });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "reconcile failed" },
      { status: 500 },
    );
  }
}
