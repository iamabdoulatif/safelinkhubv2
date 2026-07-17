// TEMPORAIRE — logique métier de la porte d'autorisation des accès distants.
// Module "plain" : importable par les server actions, les server components
// (dashboard) et la garde de enablePortForward.
// TODO: Remplacer par système de paiement intégré.

import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { remoteAccessAuthorizations } from "@/lib/db/schema";
import { isSuperAdmin, type SessionPayload } from "@/lib/auth/session";
import type { PaymentMethodId } from "./auto-setup-gate-config";
import type { RemoteAccessService } from "./remote-access-gate-config";
import type { BillingPeriod } from "@/lib/mikrotik/billing-plans";

export type RemoteAccessAuthorizationRow = typeof remoteAccessAuthorizations.$inferSelect;

/** Autorisation utilisable : approuvée + non consommée pour ce (routeur, service). */
export async function findUsableRemoteAccessAuthorization(
  routerId: string,
  service: string,
): Promise<RemoteAccessAuthorizationRow | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(remoteAccessAuthorizations)
    .where(
      and(
        eq(remoteAccessAuthorizations.routerId, routerId),
        eq(remoteAccessAuthorizations.service, service),
        eq(remoteAccessAuthorizations.status, "approved"),
        isNull(remoteAccessAuthorizations.consumedAt),
      ),
    )
    .orderBy(desc(remoteAccessAuthorizations.decidedAt))
    .limit(1);
  return row ?? null;
}

export type RemoteAccessGateDecision =
  | { ok: true; reason: "superadmin" | "authorized"; authorizationId?: string }
  | { ok: false; reason: "not_authorized" };

/** Décide si `session` peut activer ce (routeur, service). Ne consomme rien. */
export async function evaluateRemoteAccessGate(
  session: SessionPayload | null,
  routerId: string,
  service: string,
): Promise<RemoteAccessGateDecision> {
  if (isSuperAdmin(session?.role)) return { ok: true, reason: "superadmin" };
  if (!session) return { ok: false, reason: "not_authorized" };
  const auth = await findUsableRemoteAccessAuthorization(routerId, service);
  if (auth) return { ok: true, reason: "authorized", authorizationId: auth.id };
  return { ok: false, reason: "not_authorized" };
}

/** Marque une autorisation comme consommée (après activation réussie). */
export async function consumeRemoteAccessAuthorization(authorizationId: string): Promise<void> {
  const db = getDb();
  await db
    .update(remoteAccessAuthorizations)
    .set({ consumedAt: new Date() })
    .where(
      and(
        eq(remoteAccessAuthorizations.id, authorizationId),
        isNull(remoteAccessAuthorizations.consumedAt),
      ),
    );
}

/** État de la porte pour un (routeur, service) donné (UI). */
export async function getRemoteAccessGateStatus(
  session: SessionPayload | null,
  routerId: string,
  service: string,
): Promise<{ superadmin: boolean; authorized: boolean; latest: RemoteAccessAuthorizationRow | null }> {
  const superadmin = isSuperAdmin(session?.role);
  if (superadmin) return { superadmin: true, authorized: true, latest: null };

  const db = getDb();
  const [latest] = await db
    .select()
    .from(remoteAccessAuthorizations)
    .where(
      and(
        eq(remoteAccessAuthorizations.routerId, routerId),
        eq(remoteAccessAuthorizations.service, service),
      ),
    )
    .orderBy(desc(remoteAccessAuthorizations.createdAt))
    .limit(1);

  const usable = await findUsableRemoteAccessAuthorization(routerId, service);
  return { superadmin: false, authorized: Boolean(usable), latest: latest ?? null };
}

export type CreateRemoteAccessAuthorizationInput = {
  orgId: string;
  userId: string;
  requesterEmail: string;
  requesterName: string;
  routerId: string;
  routerName: string | null;
  service: RemoteAccessService;
  billingPeriod: BillingPeriod;
  amountFcfa: number;
  paymentMethod: PaymentMethodId;
  proofUrl: string | null;
};

export async function createRemoteAccessAuthorizationRequest(
  input: CreateRemoteAccessAuthorizationInput,
): Promise<RemoteAccessAuthorizationRow> {
  const db = getDb();
  const [row] = await db
    .insert(remoteAccessAuthorizations)
    .values({ ...input, status: "pending" })
    .returning();
  return row;
}

export type CreatePendingRemoteAccessPaymentInput = {
  orgId: string;
  userId: string;
  requesterEmail: string;
  requesterName: string;
  routerId: string;
  routerName: string | null;
  service: RemoteAccessService;
  billingPeriod: BillingPeriod;
  amountFcfa: number;
};

/**
 * Crée une demande d'accès distant en attente de PAIEMENT EN LIGNE GeniusPay
 * (moyen "geniuspay", sans preuve). Contrairement au flux manuel, aucun admin
 * ne valide : c'est le webhook payment.success qui l'approuve. Renvoie la ligne
 * pour qu'on y attache ensuite la référence de la transaction.
 */
export async function createPendingRemoteAccessPayment(
  input: CreatePendingRemoteAccessPaymentInput,
): Promise<RemoteAccessAuthorizationRow> {
  const db = getDb();
  const [row] = await db
    .insert(remoteAccessAuthorizations)
    .values({ ...input, paymentMethod: "geniuspay", proofUrl: null, status: "pending" })
    .returning();
  return row;
}

/** Attache la référence GeniusPay à une demande (après création du checkout). */
export async function attachRemoteAccessPaymentReference(
  id: string,
  paymentReference: string,
): Promise<void> {
  const db = getDb();
  await db
    .update(remoteAccessAuthorizations)
    .set({ paymentReference })
    .where(eq(remoteAccessAuthorizations.id, id));
}

/**
 * Approuve la demande liée à une référence GeniusPay — appelée par le webhook.
 * Idempotent : ne touche que les lignes encore "pending", donc rejouer le
 * webhook (ou le retester) ne change rien. Renvoie la ligne approuvée, ou null
 * si la référence est inconnue / déjà traitée.
 */
export async function approveRemoteAccessPaymentByReference(
  paymentReference: string,
): Promise<RemoteAccessAuthorizationRow | null> {
  const db = getDb();
  const [row] = await db
    .update(remoteAccessAuthorizations)
    .set({ status: "approved", decidedAt: new Date(), adminNote: "Payé en ligne (GeniusPay)" })
    .where(
      and(
        eq(remoteAccessAuthorizations.paymentReference, paymentReference),
        eq(remoteAccessAuthorizations.status, "pending"),
      ),
    )
    .returning();
  return row ?? null;
}

export async function listRemoteAccessAuthorizations(): Promise<RemoteAccessAuthorizationRow[]> {
  const db = getDb();
  return db
    .select()
    .from(remoteAccessAuthorizations)
    .orderBy(desc(remoteAccessAuthorizations.createdAt));
}

export async function decideRemoteAccessAuthorization(
  id: string,
  decision: "approved" | "rejected",
  decidedBy: string,
  adminNote?: string,
): Promise<RemoteAccessAuthorizationRow | null> {
  const db = getDb();
  const [row] = await db
    .update(remoteAccessAuthorizations)
    .set({
      status: decision,
      decidedAt: new Date(),
      decidedBy,
      adminNote: adminNote?.trim() || null,
    })
    .where(
      and(
        eq(remoteAccessAuthorizations.id, id),
        eq(remoteAccessAuthorizations.status, "pending"),
      ),
    )
    .returning();
  return row ?? null;
}
