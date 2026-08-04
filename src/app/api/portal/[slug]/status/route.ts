// Endpoint PUBLIC pollé par le portail captif après l'ouverture du checkout.
// Vérifie le paiement server-to-server (API GeniusPay, clés de l'org), et à la
// confirmation honore la commande (user hotspot lié au MAC + SMS) puis renvoie
// le code pour que login.html auto-soumette le formulaire de login du routeur.
// Un webhook GeniusPay signé confirme désormais le paiement dès sa réception.
// Ce polling reste un filet de secours pour les anciens comptes et il renvoie
// le code dès que le ticket est réellement créé sur le routeur.

import { after } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { organizations, portalOrders } from "@/lib/db/schema";
import { fulfillPortalOrder, sendPortalTicketSms } from "@/lib/portal/fulfill";
import { buildRouterLoginUrl } from "@/lib/portal/router-login-url";
import { corsJson, corsPreflight } from "@/lib/portal/cors";
import { getOrgGeniusCreds, getOrgPaymentStatus } from "@/lib/payment-gateways/geniuspay-org";

export function OPTIONS() {
  return corsPreflight();
}

// Le code est prêt dès que le user hotspot et le voucher sont persistés. Le SMS
// est une livraison secondaire : `after` le continue sans retenir la réponse
// HTTP qui affiche le code au client. Next.js le garantit pour le serveur Node
// auto-hébergé et l'image Docker de production.
function queuePortalTicketSms(orderId: string): void {
  after(async () => {
    const sms = await sendPortalTicketSms(orderId);
    if (!sms.ok) console.warn("[portal:sms] envoi différé impossible", { orderId, error: sms.error });
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const orderId = new URL(request.url).searchParams.get("orderId")?.trim();
  if (!orderId) return corsJson({ error: "orderId manquant." }, { status: 400 });

  const db = getDb();
  const [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, slug))
    .limit(1);
  if (!org) return corsJson({ error: "Organisation inconnue." }, { status: 404 });

  const [order] = await db
    .select()
    .from(portalOrders)
    .where(and(eq(portalOrders.id, orderId), eq(portalOrders.orgId, org.id)))
    .limit(1);
  if (!order) return corsJson({ error: "Commande introuvable." }, { status: 404 });

  if (order.status === "fulfilled") {
    const fulfilled = await fulfillPortalOrder(order.id, { sendSms: false }); // idempotent → renvoie le code
    if (fulfilled.ok) queuePortalTicketSms(order.id);
    return corsJson({
      status: "fulfilled",
      code: fulfilled.ok ? fulfilled.code : "",
      // URL de login du hotspot → auto-connexion du téléphone avec le code.
      loginUrl: fulfilled.ok ? await buildRouterLoginUrl(order.routerId) : null,
      // true ⇒ le SMS a été remis au fournisseur ; sinon l'UI propose un renvoi.
      smsSent: fulfilled.ok ? fulfilled.smsSent : false,
    });
  }
  if (order.status === "failed") {
    return corsJson({ status: "failed", error: order.failureReason ?? "Paiement échoué." });
  }
  if (order.status === "payment_initiating") {
    return corsJson({ status: "pending" });
  }

  // pending : confirmer le paiement auprès de GeniusPay avant d'honorer.
  if (order.status === "pending") {
    if (!order.paymentReference) {
      return corsJson({ status: "pending" });
    }
    const creds = await getOrgGeniusCreds(org.id);
    if (!creds) {
      const reason = "Passerelle GeniusPay indisponible.";
      if (order.failureReason !== reason) {
        console.error("[portal:status] passerelle GeniusPay indisponible", { orderId, orgId: org.id });
        await db
          .update(portalOrders)
          .set({ failureReason: reason })
          .where(and(eq(portalOrders.id, order.id), eq(portalOrders.status, "pending")));
      }
      return corsJson({ status: "pending" });
    }
    const gp = await getOrgPaymentStatus(creds, order.paymentReference);
    if (!gp.ok) {
      const reason = `Confirmation GeniusPay indisponible : ${gp.error}`.slice(0, 500);
      if (order.failureReason !== reason) {
        console.error("[portal:status] verification GeniusPay impossible", { orderId, error: gp.error });
        await db
          .update(portalOrders)
          .set({ failureReason: reason })
          .where(and(eq(portalOrders.id, order.id), eq(portalOrders.status, "pending")));
      }
      // Erreur transitoire : le portail et le cron continuent de re-sonder.
      return corsJson({ status: "pending" });
    }
    if (gp.status === "failed") {
      await db
        .update(portalOrders)
        .set({ status: "failed", failureReason: "Paiement échoué ou annulé." })
        .where(and(eq(portalOrders.id, order.id), eq(portalOrders.status, "pending")));
      return corsJson({ status: "failed", error: "Paiement échoué ou annulé." });
    }
    if (gp.status !== "completed") {
      return corsJson({ status: "pending" });
    }
    // Payé : bascule pending → paid (garde), puis on tombe dans l'honneur.
    await db
      .update(portalOrders)
      .set({ status: "paid" })
      .where(and(eq(portalOrders.id, order.id), eq(portalOrders.status, "pending")));
  }

  // paid | fulfilling (ou tout juste basculé) : tenter l'honneur (mono-flight).
  const result = await fulfillPortalOrder(order.id, { sendSms: false });
  if (result.ok) {
    queuePortalTicketSms(order.id);
    return corsJson({
      status: "fulfilled",
      code: result.code,
      loginUrl: await buildRouterLoginUrl(order.routerId),
      smsSent: result.smsSent,
    });
  }
  if (order.failureReason !== result.error) {
    console.error("[portal:status] honneur de commande impossible", { orderId, error: result.error });
  }
  // Échec transitoire (routeur hors-ligne) ou traitement concurrent : le portail
  // continue de sonder. On ne révèle pas le détail au client final.
  return corsJson({ status: "processing" });
}
