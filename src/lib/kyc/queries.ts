import "server-only";
import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { kycVerifications, organizations, users } from "@/lib/db/schema";

/** Statuts exposés comme onglets, dans l'ordre d'urgence pour l'examinateur. */
export const KYC_TABS = [
  { key: "under_review", label: "En attente" },
  { key: "approved", label: "Validés" },
  { key: "rejected", label: "Refusés" },
  { key: "not_started", label: "Non commencés" },
  { key: "all", label: "Tous" },
] as const;

export type KycTab = (typeof KYC_TABS)[number]["key"];

export async function listKycRows(tab: KycTab, recherche: string) {
  const db = getDb();
  const q = recherche.trim();
  const motif = q ? `%${q.replace(/[%_]/g, (c) => `\\${c}`)}%` : null;

  return db
    .select({
      orgId: kycVerifications.orgId,
      orgName: organizations.name,
      status: kycVerifications.status,
      documentType: kycVerifications.documentType,
      fullName: kycVerifications.fullName,
      attempts: kycVerifications.attempts,
      submittedAt: kycVerifications.submittedAt,
      decidedAt: kycVerifications.decidedAt,
      /* Contact = le compte le plus ANCIEN de l'organisation, c'est-à-dire
         celui qui l'a créée. Une organisation peut en compter plusieurs. */
      email: sql<string | null>`(
        select u.email from ${users} u
        where u.org_id = ${kycVerifications.orgId}
        order by u.created_at asc limit 1
      )`,
    })
    .from(kycVerifications)
    .innerJoin(organizations, eq(organizations.id, kycVerifications.orgId))
    .where(
      and(
        tab === "all" ? undefined : eq(kycVerifications.status, tab),
        motif
          ? or(ilike(organizations.name, motif), ilike(kycVerifications.fullName, motif))
          : undefined,
      ),
    )
    .orderBy(desc(kycVerifications.submittedAt), asc(organizations.name));
}

/** Compte par statut — alimente les pastilles des onglets. */
export async function countKycByStatus() {
  const rows = await getDb()
    .select({ status: kycVerifications.status, total: sql<number>`count(*)`.mapWith(Number) })
    .from(kycVerifications)
    .groupBy(kycVerifications.status);
  const parStatut = Object.fromEntries(rows.map((r) => [r.status, r.total]));
  return {
    ...parStatut,
    all: rows.reduce((n, r) => n + r.total, 0),
  } as Record<string, number>;
}

export async function getKycDetail(orgId: string) {
  const db = getDb();
  const [row] = await db
    .select({
      orgId: kycVerifications.orgId,
      orgName: organizations.name,
      status: kycVerifications.status,
      documentType: kycVerifications.documentType,
      fullName: kycVerifications.fullName,
      fullAddress: kycVerifications.fullAddress,
      agreedAt: kycVerifications.agreedAt,
      attempts: kycVerifications.attempts,
      submittedAt: kycVerifications.submittedAt,
      decidedAt: kycVerifications.decidedAt,
      adminNote: kycVerifications.adminNote,
      createdAt: kycVerifications.createdAt,
    })
    .from(kycVerifications)
    .innerJoin(organizations, eq(organizations.id, kycVerifications.orgId))
    .where(eq(kycVerifications.orgId, orgId))
    .limit(1);
  if (!row) return null;

  const membres = await db
    .select({ name: users.name, email: users.email, role: users.role, createdAt: users.createdAt })
    .from(users)
    .where(eq(users.orgId, orgId))
    .orderBy(asc(users.createdAt));

  return { ...row, membres };
}
