// Membres d'une organisation et invitations en cours — lectures seules, hors
// d'un fichier "use server" (même convention que lib/dashboard/queries.ts).
import "server-only";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { orgInvitations, users } from "@/lib/db/schema";

export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type Member = {
  id: string;
  name: string;
  email: string;
  role: string;
  emailVerified: boolean;
  createdAt: Date;
};

export async function listMembers(orgId: string): Promise<Member[]> {
  return getDb()
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      emailVerified: users.emailVerified,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.orgId, orgId))
    // Le plus ancien d'abord : c'est le compte qui a créé l'organisation.
    .orderBy(asc(users.createdAt));
}

export type PendingInvitation = {
  id: string;
  email: string;
  role: string;
  expiresAt: Date;
  /** Calculé ICI : `Date.now()` pendant le rendu est impur, et l'horloge du
   *  visiteur n'a pas à décider si une invitation est encore valable. */
  expired: boolean;
  createdAt: Date;
};

/** Invitations encore ouvertes : ni acceptées, ni révoquées. Les expirées sont
 *  conservées et affichées comme telles — les masquer laisserait croire que
 *  l'invitation n'a jamais été envoyée. */
export async function listPendingInvitations(orgId: string): Promise<PendingInvitation[]> {
  const maintenant = Date.now();
  const rows = await getDb()
    .select({
      id: orgInvitations.id,
      email: orgInvitations.email,
      role: orgInvitations.role,
      expiresAt: orgInvitations.expiresAt,
      createdAt: orgInvitations.createdAt,
    })
    .from(orgInvitations)
    .where(
      and(
        eq(orgInvitations.orgId, orgId),
        isNull(orgInvitations.acceptedAt),
        isNull(orgInvitations.revokedAt),
      ),
    )
    .orderBy(desc(orgInvitations.createdAt));
  return rows.map((r) => ({ ...r, expired: r.expiresAt.getTime() < maintenant }));
}

/** Nombre d'administrateurs complets — sert à refuser le retrait du dernier. */
export async function countAdmins(orgId: string): Promise<number> {
  const rows = await getDb()
    .select({ role: users.role })
    .from(users)
    .where(eq(users.orgId, orgId));
  return rows.filter((r) => r.role === "admin" || r.role === "superadmin").length;
}
