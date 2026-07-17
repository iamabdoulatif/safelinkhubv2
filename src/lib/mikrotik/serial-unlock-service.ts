// Logique métier des demandes de déblocage d'un verrou de série (support).
// Module "plain" (pas de "use server") : importable par les server actions, les
// server components (dashboard superadmin) et toute garde éventuelle.
//
// Un MikroTik (par numéro de série) est rattaché au 1er compte qui le met en
// service (voir router-serial-lock.ts). Un utilisateur d'un AUTRE compte qui
// hérite de l'appareil (revente, reprise) est bloqué avec « Contactez le
// support ». Ce module permet de matérialiser ce contact en une demande
// in-app : l'utilisateur la crée, le superadmin la valide (→ libère le verrou)
// ou la refuse.

import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { routerSerialLocks, routerSerialUnlockRequests } from "@/lib/db/schema";
import { releaseRouterSerialLock } from "./router-serial-lock";

export type SerialUnlockRequestRow = typeof routerSerialUnlockRequests.$inferSelect;

export type CreateSerialUnlockRequestInput = {
  orgId: string;
  userId: string;
  requesterEmail: string;
  requesterName: string;
  serialNumber: string;
  routerId: string | null;
  routerName: string | null;
  note: string | null;
};

export async function createSerialUnlockRequest(
  input: CreateSerialUnlockRequestInput,
): Promise<SerialUnlockRequestRow> {
  const db = getDb();
  const [row] = await db
    .insert(routerSerialUnlockRequests)
    .values({ ...input, status: "pending" })
    .returning();
  return row;
}

/** Le SN est-il ACTUELLEMENT verrouillé par un AUTRE org que `orgId` ? */
export async function isSerialLockedByAnotherOrg(
  serialNumber: string,
  orgId: string,
): Promise<boolean> {
  const db = getDb();
  const [lock] = await db
    .select({ orgId: routerSerialLocks.orgId, releasedAt: routerSerialLocks.releasedAt })
    .from(routerSerialLocks)
    .where(eq(routerSerialLocks.serialNumber, serialNumber))
    .limit(1);
  if (!lock) return false;
  return lock.releasedAt === null && lock.orgId !== orgId;
}

/** Dernière demande d'un (SN, org) pour l'état de l'UI. */
export async function getLatestSerialUnlockRequest(
  serialNumber: string,
  orgId: string,
): Promise<SerialUnlockRequestRow | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(routerSerialUnlockRequests)
    .where(
      and(
        eq(routerSerialUnlockRequests.serialNumber, serialNumber),
        eq(routerSerialUnlockRequests.orgId, orgId),
      ),
    )
    .orderBy(desc(routerSerialUnlockRequests.createdAt))
    .limit(1);
  return row ?? null;
}

/** Liste toutes les demandes (dashboard superadmin), plus récentes d'abord. */
export async function listSerialUnlockRequests(): Promise<SerialUnlockRequestRow[]> {
  const db = getDb();
  return db
    .select()
    .from(routerSerialUnlockRequests)
    .orderBy(desc(routerSerialUnlockRequests.createdAt));
}

/** Nombre de demandes en attente (badge in-app). */
export async function countPendingSerialUnlockRequests(): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(routerSerialUnlockRequests)
    .where(eq(routerSerialUnlockRequests.status, "pending"));
  return row?.n ?? 0;
}

/**
 * Valide ou refuse une demande. Idempotent (ne touche qu'une demande "pending").
 * À l'APPROBATION, libère le verrou de série : le SN redevient ré-utilisable,
 * si bien que le prochain passage en service du demandeur le rattache à SON
 * compte (transfert du verrou, voir reserveRouterSerial). Le déblocage n'est
 * effectif que si la demande était bien en attente — sinon on renvoie null.
 */
export async function decideSerialUnlockRequest(
  id: string,
  decision: "approved" | "rejected",
  decidedBy: string,
  adminNote?: string,
): Promise<SerialUnlockRequestRow | null> {
  const db = getDb();
  const [row] = await db
    .update(routerSerialUnlockRequests)
    .set({
      status: decision,
      decidedAt: new Date(),
      decidedBy,
      adminNote: adminNote?.trim() || null,
    })
    .where(
      and(
        eq(routerSerialUnlockRequests.id, id),
        eq(routerSerialUnlockRequests.status, "pending"),
      ),
    )
    .returning();
  if (!row) return null;

  if (decision === "approved") {
    // Libère le verrou encore actif pour ce SN → ré-utilisable. Sans effet si
    // le verrou avait déjà été libéré entre-temps (releaseRouterSerialLock ne
    // touche que les verrous non libérés).
    await releaseRouterSerialLock(row.serialNumber, decidedBy).catch(() => false);
  }
  return row;
}

/** Y a-t-il un verrou actif (non libéré) pour ce SN ? (garde légère.) */
export async function hasActiveSerialLock(serialNumber: string): Promise<boolean> {
  const db = getDb();
  const [lock] = await db
    .select({ id: routerSerialLocks.id })
    .from(routerSerialLocks)
    .where(
      and(
        eq(routerSerialLocks.serialNumber, serialNumber),
        isNull(routerSerialLocks.releasedAt),
      ),
    )
    .limit(1);
  return Boolean(lock);
}
