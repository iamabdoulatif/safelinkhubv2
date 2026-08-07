// TEMPORAIRE — logique métier de la porte d'autorisation des accès distants.
// Module "plain" : importable par les server actions, les server components
// (dashboard) et la garde de enablePortForward.
// TODO: Remplacer par système de paiement intégré.

import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { organizations, remoteAccessAuthorizations } from "@/lib/db/schema";
import { isSuperAdmin, type SessionPayload } from "@/lib/auth/session";
import { getVpnQuotaStatus } from "./vpn-quota";
import type { PaymentMethodId } from "./auto-setup-gate-config";
import type { RemoteAccessService } from "./remote-access-gate-config";
import type { BillingPeriod } from "@/lib/mikrotik/billing-plans";
import { findUsableRemoteAccessGrant } from "@/lib/remote-access/grants";
import { awardVpnYearlyReferral } from "@/lib/referrals/service";

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
  | { ok: true; reason: "temporary_grant"; grantId: string; expiresAt: Date }
  | { ok: true; reason: "quota"; expiresAt: Date | null }
  | { ok: false; reason: "not_authorized" };

/** Décide si `session` peut activer ce (routeur, service). Ne consomme rien. */
export async function evaluateRemoteAccessGate(
  session: SessionPayload | null,
  routerId: string,
  service: string,
): Promise<RemoteAccessGateDecision> {
  if (isSuperAdmin(session?.role)) return { ok: true, reason: "superadmin" };
  if (!session) return { ok: false, reason: "not_authorized" };
  const grant = await findUsableRemoteAccessGrant(session.orgId, routerId, service);
  if (grant) return { ok: true, reason: "temporary_grant", grantId: grant.id, expiresAt: grant.expiresAt };
  const [org] = await getDb()
    .select({ vpnQuotaMode: organizations.vpnQuotaMode, vpnQuotaExpiresAt: organizations.vpnQuotaExpiresAt })
    .from(organizations)
    .where(eq(organizations.id, session.orgId))
    .limit(1);
  const quota = org ? getVpnQuotaStatus(org) : null;
  if (quota?.free) return { ok: true, reason: "quota", expiresAt: quota.expiresAt };
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
): Promise<{
  superadmin: boolean;
  authorized: boolean;
  latest: RemoteAccessAuthorizationRow | null;
  temporaryGrant: { id: string; expiresAt: Date; reason: string } | null;
}> {
  const superadmin = isSuperAdmin(session?.role);
  if (superadmin) return { superadmin: true, authorized: true, latest: null, temporaryGrant: null };
  if (!session) return { superadmin: false, authorized: false, latest: null, temporaryGrant: null };

  const temporaryGrant = await findUsableRemoteAccessGrant(session.orgId, routerId, service);

  const db = getDb();
  const [org] = await db
    .select({ vpnQuotaMode: organizations.vpnQuotaMode, vpnQuotaExpiresAt: organizations.vpnQuotaExpiresAt })
    .from(organizations)
    .where(eq(organizations.id, session.orgId))
    .limit(1);
  const quota = org ? getVpnQuotaStatus(org) : null;
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
  return {
    superadmin: false,
    authorized: Boolean(usable || temporaryGrant || quota?.free),
    latest: latest ?? null,
    temporaryGrant: temporaryGrant
      ? { id: temporaryGrant.id, expiresAt: temporaryGrant.expiresAt, reason: temporaryGrant.reason }
      : null,
  };
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
  // Parrainage : un accès distant D'UN AN qui vient d'être payé rapporte au
  // parrain du filleul. Placé ici (et non chez l'appelant) pour couvrir le
  // webhook quel que soit son point d'entrée. Le `pending`-only ci-dessus rend
  // l'appel idempotent, awardReferral l'est aussi.
  if (row) await awardVpnYearlyReferral(row.orgId, row.billingPeriod);
  return row ?? null;
}

/**
 * Crée une autorisation DÉJÀ APPROUVÉE — utilisée par le paiement « depuis le
 * solde » (portefeuille FCFA ou Safecoins), débité côté serveur. `paymentMethod`
 * = "wallet" | "safecoin" (colonne texte libre, comme "geniuspay").
 */
export async function createApprovedRemoteAccessAuthorization(input: {
  orgId: string;
  userId: string;
  requesterEmail: string;
  requesterName: string;
  routerId: string;
  routerName: string | null;
  service: RemoteAccessService;
  billingPeriod: BillingPeriod;
  amountFcfa: number;
  paymentMethod: string;
  adminNote: string;
}): Promise<RemoteAccessAuthorizationRow> {
  const db = getDb();
  const [row] = await db
    .insert(remoteAccessAuthorizations)
    .values({
      orgId: input.orgId,
      userId: input.userId,
      requesterEmail: input.requesterEmail,
      requesterName: input.requesterName,
      routerId: input.routerId,
      routerName: input.routerName,
      service: input.service,
      billingPeriod: input.billingPeriod,
      amountFcfa: input.amountFcfa,
      paymentMethod: input.paymentMethod,
      proofUrl: null,
      status: "approved",
      decidedAt: new Date(),
      adminNote: input.adminNote,
    })
    .returning();
  return row;
}

/** Filet : rejette une autorisation (ex. si le débit du solde échoue après coup). */
export async function markRemoteAccessAuthorizationRejected(id: string, note: string): Promise<void> {
  const db = getDb();
  await db
    .update(remoteAccessAuthorizations)
    .set({ status: "rejected", adminNote: note })
    .where(eq(remoteAccessAuthorizations.id, id));
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
  // Même prime que par le webhook quand l'admin valide une preuve manuelle.
  if (row && decision === "approved") {
    await awardVpnYearlyReferral(row.orgId, row.billingPeriod);
  }
  return row ?? null;
}
