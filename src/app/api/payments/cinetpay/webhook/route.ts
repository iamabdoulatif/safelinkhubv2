// Webhook CinetPay (API directe) pour le PORTAIL CAPTIF. CinetPay POST
// { notify_token, merchant_transaction_id, transaction_id } sur notify_url après
// la validation USSD du client. On ne FAIT PAS confiance au corps : on reconfirme
// le statut server-to-server avec les clés de l'org (même autorité que le
// polling /status). Endpoint public ; l'`?org=` identifie l'organisation.
// Le cron de réconciliation reste le filet si ce webhook est manqué.

import { after } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { portalOrders } from "@/lib/db/schema";
import { getCinetpayStatus, getOrgCinetpayCreds } from "@/lib/payment-gateways/cinetpay";
import { fulfillPortalOrder, sendPortalTicketSms } from "@/lib/portal/fulfill";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const orgId = new URL(request.url).searchParams.get("org")?.trim() ?? "";
  if (!orgId) return Response.json({ error: "missing org" }, { status: 400 });

  const raw = await request.text();
  let body: Record<string, unknown> = {};
  try {
    body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    // CinetPay peut aussi notifier en form-urlencoded (checkout classique).
    body = Object.fromEntries(new URLSearchParams(raw));
  }
  const ref = String(body.merchant_transaction_id || body.cpm_trans_id || "").trim();
  if (!ref) return Response.json({ received: true, handled: false, reason: "no reference" });

  const db = getDb();
  const [order] = await db
    .select({ id: portalOrders.id, routerId: portalOrders.routerId })
    .from(portalOrders)
    .where(
      and(
        eq(portalOrders.orgId, orgId),
        eq(portalOrders.paymentReference, ref),
        eq(portalOrders.provider, "cinetpay"),
      ),
    )
    .limit(1);
  if (!order) return Response.json({ received: true, handled: false });

  const creds = await getOrgCinetpayCreds(orgId);
  if (!creds) return Response.json({ received: true, handled: false, reason: "no gateway" });

  const st = await getCinetpayStatus(creds, ref);
  // Erreur transitoire : 500 → CinetPay re-livre, et le cron rattrape.
  if (!st.ok) return Response.json({ error: "status check failed" }, { status: 500 });

  if (st.status === "completed") {
    await db
      .update(portalOrders)
      .set({ status: "paid", failureReason: null })
      .where(and(eq(portalOrders.id, order.id), eq(portalOrders.status, "pending")));
    const orderId = order.id;
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
      .where(and(eq(portalOrders.id, order.id), eq(portalOrders.status, "pending")));
    // Pas de voie de paiement ouverte pour CinetPay (USSD cellulaire) → rien à fermer.
    return Response.json({ received: true, handled: true });
  }
  return Response.json({ received: true, handled: false, pending: true });
}
