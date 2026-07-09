// Endpoint PUBLIC pollé par le portail captif après l'ouverture du checkout.
// Vérifie le paiement server-to-server (API GeniusPay, clés de l'org), et à la
// confirmation honore la commande (user hotspot lié au MAC + SMS) puis renvoie
// le code pour que login.html auto-soumette le formulaire de login du routeur.
// Aucun webhook : le portail sonde ce statut (le client final est présent, et
// les clés par-org n'ont pas de secret de webhook).

import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { organizations, portalOrders } from "@/lib/db/schema";
import { fulfillPortalOrder } from "@/lib/portal/fulfill";
import { getOrgGeniusCreds, getOrgPaymentStatus } from "@/lib/payment-gateways/geniuspay-org";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const orderId = new URL(request.url).searchParams.get("orderId")?.trim();
  if (!orderId) return Response.json({ error: "orderId manquant." }, { status: 400 });

  const db = getDb();
  const [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, slug))
    .limit(1);
  if (!org) return Response.json({ error: "Organisation inconnue." }, { status: 404 });

  const [order] = await db
    .select()
    .from(portalOrders)
    .where(and(eq(portalOrders.id, orderId), eq(portalOrders.orgId, org.id)))
    .limit(1);
  if (!order) return Response.json({ error: "Commande introuvable." }, { status: 404 });

  if (order.status === "fulfilled") {
    const fulfilled = await fulfillPortalOrder(order.id); // idempotent → renvoie le code
    return Response.json({
      status: "fulfilled",
      code: fulfilled.ok ? fulfilled.code : "",
    });
  }
  if (order.status === "failed") {
    return Response.json({ status: "failed", error: order.failureReason ?? "Paiement échoué." });
  }

  // pending : confirmer le paiement auprès de GeniusPay avant d'honorer.
  if (order.status === "pending") {
    if (!order.paymentReference) {
      return Response.json({ status: "pending" });
    }
    const creds = await getOrgGeniusCreds(org.id);
    if (!creds) {
      return Response.json({ status: "pending" });
    }
    const gp = await getOrgPaymentStatus(creds, order.paymentReference);
    if (!gp.ok) {
      // Erreur transitoire de l'API : on reste en attente, le portail re-sonde.
      return Response.json({ status: "pending" });
    }
    if (gp.status === "failed") {
      await db
        .update(portalOrders)
        .set({ status: "failed", failureReason: "Paiement échoué ou annulé." })
        .where(and(eq(portalOrders.id, order.id), eq(portalOrders.status, "pending")));
      return Response.json({ status: "failed", error: "Paiement échoué ou annulé." });
    }
    if (gp.status !== "completed") {
      return Response.json({ status: "pending" });
    }
    // Payé : bascule pending → paid (garde), puis on tombe dans l'honneur.
    await db
      .update(portalOrders)
      .set({ status: "paid" })
      .where(and(eq(portalOrders.id, order.id), eq(portalOrders.status, "pending")));
  }

  // paid | fulfilling (ou tout juste basculé) : tenter l'honneur (mono-flight).
  const result = await fulfillPortalOrder(order.id);
  if (result.ok) {
    return Response.json({ status: "fulfilled", code: result.code });
  }
  // Échec transitoire (routeur hors-ligne) ou traitement concurrent : le portail
  // continue de sonder. On ne révèle pas le détail au client final.
  return Response.json({ status: "processing" });
}
