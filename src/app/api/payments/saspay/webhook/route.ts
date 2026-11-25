// Webhook SasPay (API softpay) pour le PORTAIL CAPTIF. SasPay POST
// { event, data:{ id, reference, status, … } } + en-têtes de signature. On NE
// FAIT PAS confiance au corps : on reconfirme le statut server-to-server avec la
// clé de l'org (GET /payments/{id}/verify/), même autorité que le polling
// /status — pas besoin du secret de signature. L'`?org=` identifie l'org.
// Le cron de réconciliation reste le filet si ce webhook est manqué.

import { after } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { portalOrders } from "@/lib/db/schema";
import { getOrgSaspayCreds, getSaspayStatus } from "@/lib/payment-gateways/saspay";
import { fulfillPortalOrder, sendPortalTicketSms } from "@/lib/portal/fulfill";
import { closePaymentLaneForOrder } from "@/lib/portal/payment-lane-open";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const orgId = new URL(request.url).searchParams.get("org")?.trim() ?? "";
  if (!orgId) return Response.json({ error: "missing org" }, { status: 400 });

  const raw = await request.text();
  let body: { data?: Record<string, unknown> } = {};
  try {
    body = raw ? (JSON.parse(raw) as { data?: Record<string, unknown> }) : {};
  } catch {
    return Response.json({ received: true, handled: false, reason: "bad body" });
  }
  // `paymentReference` stocke l'id SasPay (celui qu'on interroge pour le statut).
  const ref = String(body.data?.id || body.data?.reference || "").trim();
  if (!ref) return Response.json({ received: true, handled: false, reason: "no reference" });

  const db = getDb();
  const [order] = await db
    .select({ id: portalOrders.id })
    .from(portalOrders)
    .where(
      and(
        eq(portalOrders.orgId, orgId),
        eq(portalOrders.paymentReference, ref),
        eq(portalOrders.provider, "saspay"),
      ),
    )
    .limit(1);
  if (!order) return Response.json({ received: true, handled: false });

  const creds = await getOrgSaspayCreds(orgId);
  if (!creds) return Response.json({ received: true, handled: false, reason: "no gateway" });

  const st = await getSaspayStatus(creds, ref);
  // Erreur transitoire : 500 → SasPay re-livre (jusqu'à 5 fois) et le cron rattrape.
  if (!st.ok) return Response.json({ error: "status check failed" }, { status: 500 });

  const orderId = order.id;
  if (st.status === "completed") {
    await db
      .update(portalOrders)
      .set({ status: "paid", failureReason: null })
      .where(and(eq(portalOrders.id, orderId), eq(portalOrders.status, "pending")));
    after(async () => {
      const fulfilled = await fulfillPortalOrder(orderId, { sendSms: false });
      if (fulfilled.ok) await sendPortalTicketSms(orderId);
    });
    return Response.json({ received: true, handled: true });
  }
  if (st.status === "failed") {
    await db
      .update(portalOrders)
      .set({ status: "failed", failureReason: "Paiement échoué ou annulé." })
      .where(and(eq(portalOrders.id, orderId), eq(portalOrders.status, "pending")));
    // Ferme la voie de paiement si elle avait été ouverte (Wave/Orange redirection).
    after(() => closePaymentLaneForOrder(orderId));
    return Response.json({ received: true, handled: true });
  }
  return Response.json({ received: true, handled: false, pending: true });
}
