// TEMPORAIRE — logique métier de la porte d'autorisation générique
// (router_link / remote_access). Module "plain" (pas de "use server") :
// importable par les server actions, les server components et les gardes des
// actions mikrotik (connectRouter / generateInstallScript).
// TODO: Remplacer par système de paiement intégré.

import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { featureAccessAuthorizations } from "@/lib/db/schema";
import { isSuperAdmin, type SessionPayload } from "@/lib/auth/session";
import type { FeatureAccessId } from "./feature-access-config";

export type FeatureAccessRow = typeof featureAccessAuthorizations.$inferSelect;

/**
 * Autorisation utilisable pour cette org + fonctionnalité : approuvée et pas
 * encore consommée. Cœur de la garde. La plus récemment décidée d'abord.
 */
export async function findUsableFeatureAuthorization(
  orgId: string,
  feature: FeatureAccessId,
): Promise<FeatureAccessRow | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(featureAccessAuthorizations)
    .where(
      and(
        eq(featureAccessAuthorizations.orgId, orgId),
        eq(featureAccessAuthorizations.feature, feature),
        eq(featureAccessAuthorizations.status, "approved"),
        isNull(featureAccessAuthorizations.consumedAt),
      ),
    )
    .orderBy(desc(featureAccessAuthorizations.decidedAt))
    .limit(1);
  return row ?? null;
}

export type FeatureGateDecision =
  | { ok: true; reason: "superadmin" | "authorized"; authorizationId?: string }
  | { ok: false; reason: "not_authorized" };

/**
 * Décide si `session` peut utiliser `feature`. Le superadmin passe toujours ;
 * sinon il faut une autorisation utilisable. NE consomme rien.
 */
export async function evaluateFeatureAccessGate(
  session: SessionPayload | null,
  feature: FeatureAccessId,
): Promise<FeatureGateDecision> {
  if (isSuperAdmin(session?.role)) return { ok: true, reason: "superadmin" };
  if (!session) return { ok: false, reason: "not_authorized" };
  const auth = await findUsableFeatureAuthorization(session.orgId, feature);
  if (auth) return { ok: true, reason: "authorized", authorizationId: auth.id };
  return { ok: false, reason: "not_authorized" };
}

/** Marque une autorisation comme consommée (après un usage réussi). */
export async function consumeFeatureAuthorization(authorizationId: string): Promise<void> {
  const db = getDb();
  await db
    .update(featureAccessAuthorizations)
    .set({ consumedAt: new Date() })
    .where(
      and(
        eq(featureAccessAuthorizations.id, authorizationId),
        isNull(featureAccessAuthorizations.consumedAt),
      ),
    );
}

/** État de la porte pour l'UI : autorisé + statut de la dernière demande. */
export async function getFeatureAccessGateStatus(
  session: SessionPayload | null,
  feature: FeatureAccessId,
): Promise<{ superadmin: boolean; authorized: boolean; latestStatus: string | null }> {
  if (isSuperAdmin(session?.role)) {
    return { superadmin: true, authorized: true, latestStatus: null };
  }
  if (!session) return { superadmin: false, authorized: false, latestStatus: null };

  const db = getDb();
  const [latest] = await db
    .select()
    .from(featureAccessAuthorizations)
    .where(
      and(
        eq(featureAccessAuthorizations.orgId, session.orgId),
        eq(featureAccessAuthorizations.feature, feature),
      ),
    )
    .orderBy(desc(featureAccessAuthorizations.createdAt))
    .limit(1);

  const usable = await findUsableFeatureAuthorization(session.orgId, feature);
  return { superadmin: false, authorized: Boolean(usable), latestStatus: latest?.status ?? null };
}

export type CreateFeatureAccessInput = {
  orgId: string;
  userId: string;
  requesterEmail: string;
  requesterName: string;
  feature: FeatureAccessId;
  note: string | null;
};

export async function createFeatureAccessRequest(
  input: CreateFeatureAccessInput,
): Promise<FeatureAccessRow> {
  const db = getDb();
  const [row] = await db
    .insert(featureAccessAuthorizations)
    .values({ ...input, status: "pending" })
    .returning();
  return row;
}

/** Liste toutes les demandes (dashboard superadmin), plus récentes d'abord. */
export async function listFeatureAccessAuthorizations(): Promise<FeatureAccessRow[]> {
  const db = getDb();
  return db
    .select()
    .from(featureAccessAuthorizations)
    .orderBy(desc(featureAccessAuthorizations.createdAt));
}

/** Nombre de demandes en attente (badge in-app). */
export async function countPendingFeatureAccess(): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(featureAccessAuthorizations)
    .where(eq(featureAccessAuthorizations.status, "pending"));
  return row?.n ?? 0;
}

/** Valide ou refuse une demande. Idempotent sur une demande déjà décidée. */
export async function decideFeatureAccessAuthorization(
  id: string,
  decision: "approved" | "rejected",
  decidedBy: string,
  adminNote?: string,
): Promise<FeatureAccessRow | null> {
  const db = getDb();
  const [row] = await db
    .update(featureAccessAuthorizations)
    .set({
      status: decision,
      decidedAt: new Date(),
      decidedBy,
      adminNote: adminNote?.trim() || null,
    })
    .where(
      and(
        eq(featureAccessAuthorizations.id, id),
        eq(featureAccessAuthorizations.status, "pending"),
      ),
    )
    .returning();
  return row ?? null;
}
