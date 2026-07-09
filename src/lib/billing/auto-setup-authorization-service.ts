// TEMPORAIRE — logique métier de la porte d'autorisation Auto-Setup.
// Module "plain" (pas de "use server") : importable à la fois par les server
// actions (auto-setup-authorization-actions.ts), les server components
// (dashboard superadmin) et la garde de provisionHotspotStack.
// TODO: Remplacer par système de paiement intégré.

import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { autoSetupAuthorizations } from "@/lib/db/schema";
import { isSuperAdmin, type SessionPayload } from "@/lib/auth/session";
import type { PaymentMethodId } from "./auto-setup-gate-config";

export type AuthorizationStatus = "pending" | "approved" | "rejected";

export type AutoSetupAuthorizationRow = typeof autoSetupAuthorizations.$inferSelect;

/**
 * Autorisation utilisable pour lancer un auto-setup sur ce routeur :
 * approuvée et pas encore consommée. C'est le cœur de la garde.
 */
export async function findUsableAuthorization(
  routerId: string,
): Promise<AutoSetupAuthorizationRow | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(autoSetupAuthorizations)
    .where(
      and(
        eq(autoSetupAuthorizations.routerId, routerId),
        eq(autoSetupAuthorizations.status, "approved"),
        isNull(autoSetupAuthorizations.consumedAt),
      ),
    )
    .orderBy(desc(autoSetupAuthorizations.decidedAt))
    .limit(1);
  return row ?? null;
}

export type GateDecision =
  | { ok: true; reason: "superadmin" | "authorized"; authorizationId?: string }
  | { ok: false; reason: "not_authorized" };

/**
 * Décide si `session` peut lancer un auto-setup sur `routerId`.
 * Le superadmin passe toujours ; sinon il faut une autorisation utilisable.
 * NE consomme rien (la consommation se fait après un auto-setup réussi).
 */
export async function evaluateAutoSetupGate(
  session: SessionPayload | null,
  routerId: string,
): Promise<GateDecision> {
  if (isSuperAdmin(session?.role)) return { ok: true, reason: "superadmin" };
  if (!session) return { ok: false, reason: "not_authorized" };
  const auth = await findUsableAuthorization(routerId);
  if (auth) return { ok: true, reason: "authorized", authorizationId: auth.id };
  return { ok: false, reason: "not_authorized" };
}

/** Marque une autorisation comme consommée (après auto-setup réussi). */
export async function consumeAuthorization(authorizationId: string): Promise<void> {
  const db = getDb();
  await db
    .update(autoSetupAuthorizations)
    .set({ consumedAt: new Date() })
    .where(
      and(
        eq(autoSetupAuthorizations.id, authorizationId),
        isNull(autoSetupAuthorizations.consumedAt),
      ),
    );
}

/**
 * État de la porte pour l'UI d'un routeur donné : autorisé ou non, et la
 * demande la plus récente (pour afficher "en attente", "refusée"…).
 */
export async function getAutoSetupGateStatusForRouter(
  session: SessionPayload | null,
  routerId: string,
): Promise<{
  superadmin: boolean;
  authorized: boolean;
  latest: AutoSetupAuthorizationRow | null;
}> {
  const superadmin = isSuperAdmin(session?.role);
  if (superadmin) return { superadmin: true, authorized: true, latest: null };

  const db = getDb();
  const [latest] = await db
    .select()
    .from(autoSetupAuthorizations)
    .where(eq(autoSetupAuthorizations.routerId, routerId))
    .orderBy(desc(autoSetupAuthorizations.createdAt))
    .limit(1);

  const usable = await findUsableAuthorization(routerId);
  return { superadmin: false, authorized: Boolean(usable), latest: latest ?? null };
}

export type CreateAuthorizationInput = {
  orgId: string;
  userId: string;
  requesterEmail: string;
  requesterName: string;
  routerId: string;
  routerName: string | null;
  supportsContainers: boolean;
  amountFcfa: number;
  paymentMethod: PaymentMethodId;
  proofUrl: string | null;
};

export async function createAuthorizationRequest(
  input: CreateAuthorizationInput,
): Promise<AutoSetupAuthorizationRow> {
  const db = getDb();
  const [row] = await db
    .insert(autoSetupAuthorizations)
    .values({ ...input, status: "pending" })
    .returning();
  return row;
}

export type CreatePendingAutoSetupPaymentInput = {
  orgId: string;
  userId: string;
  requesterEmail: string;
  requesterName: string;
  routerId: string;
  routerName: string | null;
  supportsContainers: boolean;
  amountFcfa: number;
};

/**
 * Crée une demande d'auto-setup en attente de PAIEMENT EN LIGNE GeniusPay
 * (moyen "geniuspay", sans preuve). C'est le webhook payment.success qui
 * l'approuvera — aucun admin ne valide.
 */
export async function createPendingAutoSetupPayment(
  input: CreatePendingAutoSetupPaymentInput,
): Promise<AutoSetupAuthorizationRow> {
  const db = getDb();
  const [row] = await db
    .insert(autoSetupAuthorizations)
    .values({ ...input, paymentMethod: "geniuspay", proofUrl: null, status: "pending" })
    .returning();
  return row;
}

/** Attache la référence GeniusPay à une demande (après création du checkout). */
export async function attachAutoSetupPaymentReference(
  id: string,
  paymentReference: string,
): Promise<void> {
  const db = getDb();
  await db
    .update(autoSetupAuthorizations)
    .set({ paymentReference })
    .where(eq(autoSetupAuthorizations.id, id));
}

/**
 * Approuve la demande liée à une référence GeniusPay — appelée par le webhook.
 * Idempotent : ne touche que les lignes "pending". Renvoie la ligne, ou null si
 * la référence est inconnue / déjà traitée.
 */
export async function approveAutoSetupPaymentByReference(
  paymentReference: string,
): Promise<AutoSetupAuthorizationRow | null> {
  const db = getDb();
  const [row] = await db
    .update(autoSetupAuthorizations)
    .set({ status: "approved", decidedAt: new Date(), adminNote: "Payé en ligne (GeniusPay)" })
    .where(
      and(
        eq(autoSetupAuthorizations.paymentReference, paymentReference),
        eq(autoSetupAuthorizations.status, "pending"),
      ),
    )
    .returning();
  return row ?? null;
}

/** Liste toutes les demandes (dashboard superadmin), plus récentes d'abord. */
export async function listAuthorizations(): Promise<AutoSetupAuthorizationRow[]> {
  const db = getDb();
  return db
    .select()
    .from(autoSetupAuthorizations)
    .orderBy(desc(autoSetupAuthorizations.createdAt));
}

/** Valide ou refuse une demande. Idempotent sur une demande déjà décidée. */
export async function decideAuthorization(
  id: string,
  decision: "approved" | "rejected",
  decidedBy: string,
  adminNote?: string,
): Promise<AutoSetupAuthorizationRow | null> {
  const db = getDb();
  const [row] = await db
    .update(autoSetupAuthorizations)
    .set({
      status: decision,
      decidedAt: new Date(),
      decidedBy,
      adminNote: adminNote?.trim() || null,
    })
    .where(
      and(
        eq(autoSetupAuthorizations.id, id),
        eq(autoSetupAuthorizations.status, "pending"),
      ),
    )
    .returning();
  return row ?? null;
}
