import { and, desc, eq, gt, inArray, lte } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { organizations, remoteAccessGrants, routers } from "@/lib/db/schema";

export const TEMPORARY_ACCESS_DURATIONS = {
  hour_1: { label: "1 heure", milliseconds: 60 * 60 * 1000 },
  hour_2: { label: "2 heures", milliseconds: 2 * 60 * 60 * 1000 },
  day_7: { label: "7 jours", milliseconds: 7 * 24 * 60 * 60 * 1000 },
  day_10: { label: "10 jours", milliseconds: 10 * 24 * 60 * 60 * 1000 },
} as const;

export type TemporaryAccessDuration = keyof typeof TEMPORARY_ACCESS_DURATIONS;
export type TemporaryAccessReason = "promo" | "referral" | "reward" | "support" | "operations" | "other";
export type TemporaryAccessStatus = "scheduled" | "active" | "expired" | "revoked";

export function isTemporaryAccessDuration(value: string): value is TemporaryAccessDuration {
  return value in TEMPORARY_ACCESS_DURATIONS;
}

export function isTemporaryAccessReason(value: string): value is TemporaryAccessReason {
  return ["promo", "referral", "reward", "support", "operations", "other"].includes(value);
}

export function expiresAtFor(duration: TemporaryAccessDuration, startsAt = new Date()) {
  return new Date(startsAt.getTime() + TEMPORARY_ACCESS_DURATIONS[duration].milliseconds);
}

export function isGrantUsable(
  grant: { status: string; startsAt: Date; expiresAt: Date },
  now = new Date(),
) {
  return (
    (grant.status === "active" || grant.status === "scheduled") &&
    now.getTime() >= grant.startsAt.getTime() &&
    now.getTime() < grant.expiresAt.getTime()
  );
}

export function grantCovers(
  grant: { routerId: string | null; services: string[] },
  routerId: string,
  service: string,
) {
  const routerMatches = grant.routerId === null || grant.routerId === routerId;
  const serviceMatches = grant.services.length === 0 || grant.services.includes(service);
  return routerMatches && serviceMatches;
}

export type RemoteAccessGrantRow = typeof remoteAccessGrants.$inferSelect;

export async function findUsableRemoteAccessGrant(orgId: string, routerId: string, service: string) {
  const now = new Date();
  const rows = await getDb()
    .select()
    .from(remoteAccessGrants)
    .where(
      and(
        eq(remoteAccessGrants.orgId, orgId),
        inArray(remoteAccessGrants.status, ["scheduled", "active"]),
        lte(remoteAccessGrants.startsAt, now),
        gt(remoteAccessGrants.expiresAt, now),
      ),
    )
    .orderBy(desc(remoteAccessGrants.expiresAt));
  return rows.find((grant) => grantCovers(grant, routerId, service)) ?? null;
}

export async function listActiveGrantsForOrg(orgId: string) {
  const now = new Date();
  return getDb()
    .select()
    .from(remoteAccessGrants)
    .where(
      and(
        eq(remoteAccessGrants.orgId, orgId),
        inArray(remoteAccessGrants.status, ["scheduled", "active"]),
        gt(remoteAccessGrants.expiresAt, now),
      ),
    )
    .orderBy(desc(remoteAccessGrants.expiresAt));
}

export async function listAllRemoteAccessGrants() {
  const rows = await getDb()
    .select({
      id: remoteAccessGrants.id,
      orgId: remoteAccessGrants.orgId,
      orgName: organizations.name,
      orgSlug: organizations.slug,
      routerId: remoteAccessGrants.routerId,
      routerName: routers.name,
      services: remoteAccessGrants.services,
      durationKey: remoteAccessGrants.durationKey,
      startsAt: remoteAccessGrants.startsAt,
      expiresAt: remoteAccessGrants.expiresAt,
      status: remoteAccessGrants.status,
      reason: remoteAccessGrants.reason,
      note: remoteAccessGrants.note,
      createdAt: remoteAccessGrants.createdAt,
      revokedAt: remoteAccessGrants.revokedAt,
      revokeReason: remoteAccessGrants.revokeReason,
    })
    .from(remoteAccessGrants)
    .innerJoin(organizations, eq(organizations.id, remoteAccessGrants.orgId))
    .leftJoin(routers, eq(routers.id, remoteAccessGrants.routerId))
    .orderBy(desc(remoteAccessGrants.createdAt));
  const now = new Date();
  return rows.map((row) => ({
    ...row,
    status:
      row.status !== "revoked" && row.expiresAt <= now
        ? "expired"
        : row.status,
  }));
}

export async function createRemoteAccessGrant(input: {
  orgId: string;
  routerId?: string | null;
  services: string[];
  durationKey: TemporaryAccessDuration;
  reason: TemporaryAccessReason;
  note?: string | null;
  createdBy: string;
  startsAt?: Date;
}) {
  const startsAt = input.startsAt ?? new Date();
  const [row] = await getDb()
    .insert(remoteAccessGrants)
    .values({
      orgId: input.orgId,
      routerId: input.routerId ?? null,
      services: input.services,
      durationKey: input.durationKey,
      startsAt,
      expiresAt: expiresAtFor(input.durationKey, startsAt),
      status: startsAt.getTime() > Date.now() ? "scheduled" : "active",
      reason: input.reason,
      note: input.note?.trim() || null,
      createdBy: input.createdBy,
    })
    .returning();
  return row;
}

export async function revokeRemoteAccessGrant(id: string, revokedBy: string, revokeReason: string) {
  const [row] = await getDb()
    .update(remoteAccessGrants)
    .set({ status: "revoked", revokedBy, revokedAt: new Date(), revokeReason: revokeReason.trim(), updatedAt: new Date() })
    .where(and(eq(remoteAccessGrants.id, id), inArray(remoteAccessGrants.status, ["scheduled", "active"])))
    .returning();
  return row ?? null;
}

export async function expireRemoteAccessGrantIfNeeded(id: string) {
  const [row] = await getDb()
    .update(remoteAccessGrants)
    .set({ status: "expired", updatedAt: new Date() })
    .where(and(eq(remoteAccessGrants.id, id), inArray(remoteAccessGrants.status, ["scheduled", "active"]), lte(remoteAccessGrants.expiresAt, new Date())))
    .returning();
  return row ?? null;
}
