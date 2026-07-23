// Rattrapage serveur des commandes portail.
//
// Le navigateur ne peut pas être la seule source de confirmation : le client
// peut fermer Paystack, perdre le réseau ou ne pas recevoir le webhook
// `payment.success`. Ce module vérifie donc périodiquement GeniusPay, puis
// rejoue l'honneur et les SMS échoués de façon idempotente.

import { and, asc, desc, eq, gte, inArray, isNotNull, ne } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { portalOrders } from "@/lib/db/schema";
import { getOrgGeniusCreds, getOrgPaymentStatus } from "@/lib/payment-gateways/geniuspay-org";
import { fulfillPortalOrder } from "@/lib/portal/fulfill";

const MAX_PAYMENT_CHECKS_PER_RUN = 30;
const MAX_SMS_RETRIES_PER_RUN = 30;
const ORDER_LOOKBACK_MS = 14 * 24 * 60 * 60 * 1000;
// Un checkout GeniusPay expire en ~1 h (champ expires_at). Une commande restée
// `pending` bien au-delà ne sera jamais payée : on la clôt pour qu'elle cesse
// de consommer le budget de vérification par run (sinon les vieilles tentatives
// abandonnées saturent le plafond, ordre le plus ancien d'abord, et les
// commandes RÉCEMMENT payées ne sont jamais atteintes — bug vécu le 23/07).
const PENDING_EXPIRY_MS = 3 * 60 * 60 * 1000;

export type PortalReconcileResult = {
  paymentsChecked: number;
  paymentsConfirmed: number;
  paymentsFailed: number;
  fulfilled: number;
  smsRetried: number;
  stillPending: number;
  errors: string[];
};

/** Synchronise les paiements et reprend les effets secondaires incomplets. */
export async function reconcilePortalOrders(): Promise<PortalReconcileResult> {
  const db = getDb();
  const result: PortalReconcileResult = {
    paymentsChecked: 0,
    paymentsConfirmed: 0,
    paymentsFailed: 0,
    fulfilled: 0,
    smsRetried: 0,
    stillPending: 0,
    errors: [],
  };
  const since = new Date(Date.now() - ORDER_LOOKBACK_MS);
  const expiryCutoff = new Date(Date.now() - PENDING_EXPIRY_MS);

  // Commandes à vérifier : les PLUS RÉCENTES d'abord (desc) — une commande tout
  // juste payée doit toujours être atteinte, même quand de vieilles tentatives
  // abandonnées s'accumulent (avant, l'ordre `asc` + le plafond faisaient que
  // les commandes récemment payées n'étaient jamais atteintes — bug du 23/07).
  const candidates = await db
    .select()
    .from(portalOrders)
    .where(
      and(
        inArray(portalOrders.status, ["pending", "paid", "fulfilling"]),
        gte(portalOrders.createdAt, since),
      ),
    )
    .orderBy(desc(portalOrders.createdAt))
    .limit(MAX_PAYMENT_CHECKS_PER_RUN);

  for (const order of candidates) {
    if (order.status === "pending") {
      if (!order.paymentReference) continue;
      result.paymentsChecked += 1;

      const creds = await getOrgGeniusCreds(order.orgId);
      if (!creds) {
        result.errors.push(`${order.id}: passerelle GeniusPay absente`);
        continue;
      }
      const payment = await getOrgPaymentStatus(creds, order.paymentReference);
      if (!payment.ok) {
        result.errors.push(`${order.id}: vérification du paiement impossible`);
        continue;
      }
      if (payment.status === "failed") {
        await db
          .update(portalOrders)
          .set({ status: "failed", failureReason: "Paiement échoué ou annulé." })
          .where(and(eq(portalOrders.id, order.id), eq(portalOrders.status, "pending")));
        result.paymentsFailed += 1;
        continue;
      }
      if (payment.status !== "completed") {
        // GeniusPay confirme « non payé » ET la commande est plus vieille que
        // l'expiration d'un checkout : elle ne se paiera jamais → on la clôt
        // pour libérer le budget de vérification (sûr : la non-complétion vient
        // de l'API, on ne clôt jamais un paiement réellement passé).
        if (order.createdAt < expiryCutoff) {
          await db
            .update(portalOrders)
            .set({ status: "failed", failureReason: "Paiement non finalisé (expiré)." })
            .where(and(eq(portalOrders.id, order.id), eq(portalOrders.status, "pending")));
          result.paymentsFailed += 1;
        } else {
          result.stillPending += 1;
        }
        continue;
      }

      const promoted = await db
        .update(portalOrders)
        .set({ status: "paid", failureReason: null })
        .where(and(eq(portalOrders.id, order.id), eq(portalOrders.status, "pending")))
        .returning({ id: portalOrders.id });
      if (promoted.length > 0) result.paymentsConfirmed += 1;
    }

    const fulfilled = await fulfillPortalOrder(order.id);
    if (fulfilled.ok) {
      result.fulfilled += 1;
      if (fulfilled.smsSent) result.smsRetried += 1;
    } else if (order.status !== "pending") {
      result.errors.push(`${order.id}: ${fulfilled.error}`);
    }
  }

  // Un SMS échoué ne remet pas en cause l'accès : on rejoue seulement les
  // commandes déjà honorées, avec le verrou d'une minute de fulfill.ts.
  const smsCandidates = await db
    .select({ id: portalOrders.id })
    .from(portalOrders)
    .where(
      and(
        eq(portalOrders.status, "fulfilled"),
        ne(portalOrders.smsStatus, "sent"),
        gte(portalOrders.createdAt, since),
        isNotNull(portalOrders.voucherId),
      ),
    )
    .orderBy(asc(portalOrders.createdAt))
    .limit(MAX_SMS_RETRIES_PER_RUN);

  for (const order of smsCandidates) {
    const fulfilled = await fulfillPortalOrder(order.id);
    if (fulfilled.ok && fulfilled.smsSent) result.smsRetried += 1;
    if (!fulfilled.ok) result.errors.push(`${order.id}: ${fulfilled.error}`);
  }

  return result;
}
