"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { orgInvitations, users } from "@/lib/db/schema";
import { getSession, requireCapability } from "@/lib/auth/session";
import { generateToken } from "@/lib/auth/tokens";
import { sendOrgInvitationEmail } from "@/lib/auth/email";
import { countAdmins, INVITATION_TTL_MS } from "./members";
import { guardChangeRole, guardInvite, guardRemoveMember } from "./member-rules";

const PAGE = "/admin/members";

/** Invite quelqu'un à rejoindre l'organisation avec un rôle. */
export async function inviteMember(_prevState: unknown, formData: FormData) {
  const session = await requireCapability("members");
  if (!session) return { error: "Action réservée aux administrateurs du compte." };

  const db = getDb();
  const [membres, ouvertes] = await Promise.all([
    db.select({ email: users.email }).from(users).where(eq(users.orgId, session.orgId)),
    db
      .select({ email: orgInvitations.email })
      .from(orgInvitations)
      .where(
        and(
          eq(orgInvitations.orgId, session.orgId),
          isNull(orgInvitations.acceptedAt),
          isNull(orgInvitations.revokedAt),
        ),
      ),
  ]);

  const verdict = guardInvite({
    email: String(formData.get("email") ?? ""),
    role: String(formData.get("role") ?? ""),
    membresExistants: membres.map((m) => m.email),
    invitationsOuvertes: ouvertes.map((m) => m.email),
  });
  if (!verdict.ok) return { error: verdict.error };

  const { token, hash } = generateToken();
  await db.insert(orgInvitations).values({
    orgId: session.orgId,
    email: verdict.email!,
    role: String(formData.get("role")),
    tokenHash: hash,
    expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
    invitedBy: session.userId,
  });

  /* L'envoi est « au mieux » : sans Resend configuré il échoue en silence.
     Le lien reste donc rendu à l'écran pour être transmis à la main — sinon
     une invitation créée mais non partie serait invisible et introuvable. */
  const envoye = await sendOrgInvitationEmail(
    verdict.email!,
    session.name ?? "",
    token,
  ).catch(() => false);

  revalidatePath(PAGE);
  return { success: true as const, sent: envoye, link: `/auth/rejoindre/${token}` };
}

export async function revokeInvitation(formData: FormData) {
  const session = await requireCapability("members");
  if (!session) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await getDb()
    .update(orgInvitations)
    .set({ revokedAt: new Date() })
    .where(and(eq(orgInvitations.id, id), eq(orgInvitations.orgId, session.orgId)));
  revalidatePath(PAGE);
}

export async function changeMemberRole(formData: FormData) {
  const session = await requireCapability("members");
  if (!session) return { error: "Action réservée aux administrateurs du compte." };

  const targetUserId = String(formData.get("userId") ?? "");
  const nextRole = String(formData.get("role") ?? "");
  const db = getDb();
  const [cible] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    // orgId de la SESSION : un identifiant du formulaire laisserait toucher
    // au membre d'une autre organisation.
    .where(and(eq(users.id, targetUserId), eq(users.orgId, session.orgId)))
    .limit(1);
  if (!cible) return { error: "Membre introuvable." };

  const verdict = guardChangeRole({
    actorUserId: session.userId,
    targetUserId: cible.id,
    currentRole: cible.role,
    nextRole,
    adminCount: await countAdmins(session.orgId),
  });
  if (!verdict.ok) return { error: verdict.error };

  await db.update(users).set({ role: nextRole }).where(eq(users.id, cible.id));
  revalidatePath(PAGE);
  return { success: true as const };
}

export async function removeMember(formData: FormData) {
  const session = await requireCapability("members");
  if (!session) return { error: "Action réservée aux administrateurs du compte." };

  const targetUserId = String(formData.get("userId") ?? "");
  const db = getDb();
  const [cible] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(and(eq(users.id, targetUserId), eq(users.orgId, session.orgId)))
    .limit(1);
  if (!cible) return { error: "Membre introuvable." };

  const verdict = guardRemoveMember({
    actorUserId: session.userId,
    targetUserId: cible.id,
    targetRole: cible.role,
    adminCount: await countAdmins(session.orgId),
  });
  if (!verdict.ok) return { error: verdict.error };

  await db.delete(users).where(eq(users.id, cible.id));
  revalidatePath(PAGE);
  return { success: true as const };
}

/** Rôle du visiteur — sert aux écrans à masquer ce qu'il ne peut pas faire. */
export async function getMyRole(): Promise<string | null> {
  const session = await getSession();
  return session?.role ?? null;
}
