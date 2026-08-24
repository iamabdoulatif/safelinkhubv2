"use server";

import { and, eq, isNull } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { getDb } from "@/lib/db";
import { orgInvitations, organizations, users } from "@/lib/db/schema";
import { hashToken } from "@/lib/auth/tokens";
import { isRole } from "@/lib/auth/roles";

export type InvitationPreview =
  | { ok: false; error: string }
  | { ok: true; orgName: string; email: string; role: string };

/** Ce que la page d'acceptation affiche AVANT toute saisie. */
export async function previewInvitation(token: string): Promise<InvitationPreview> {
  if (!token) return { ok: false, error: "Lien d'invitation incomplet." };
  const db = getDb();
  const [row] = await db
    .select({
      id: orgInvitations.id,
      email: orgInvitations.email,
      role: orgInvitations.role,
      expiresAt: orgInvitations.expiresAt,
      orgName: organizations.name,
    })
    .from(orgInvitations)
    .innerJoin(organizations, eq(organizations.id, orgInvitations.orgId))
    .where(
      and(
        eq(orgInvitations.tokenHash, hashToken(token)),
        isNull(orgInvitations.acceptedAt),
        isNull(orgInvitations.revokedAt),
      ),
    )
    .limit(1);

  if (!row) return { ok: false, error: "Invitation introuvable, déjà utilisée ou annulée." };
  if (row.expiresAt.getTime() < Date.now()) {
    return { ok: false, error: "Cette invitation a expiré. Demandez-en une nouvelle." };
  }
  return { ok: true, orgName: row.orgName, email: row.email, role: row.role };
}

/**
 * Création du compte du membre invité.
 *
 * Une adresse qui possède DÉJÀ un compte est refusée : accepter reviendrait à
 * la déplacer d'une organisation vers une autre, donc à lui faire perdre son
 * propre parc sans le lui dire. Le cas mérite un vrai parcours, pas un effet
 * de bord d'invitation.
 */
export async function acceptInvitation(_prevState: unknown, formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const name = String(formData.get("name") ?? "").trim().slice(0, 120);
  const password = String(formData.get("password") ?? "");

  const apercu = await previewInvitation(token);
  if (!apercu.ok) return { error: apercu.error };
  if (!name) return { error: "Indiquez votre nom." };

  // Même plancher que l'inscription (lib/auth/actions.ts) : huit caractères.
  // Un seuil plus bas ici ouvrirait une porte dérobée au reste du compte.
  if (password.length < 8) {
    return { error: "Le mot de passe doit contenir au moins 8 caractères." };
  }

  const db = getDb();
  const [existant] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, apercu.email))
    .limit(1);
  if (existant) {
    return {
      error:
        "Cette adresse possède déjà un compte SafeLinkHub. Contactez le support pour rattacher un compte existant à une autre organisation.",
    };
  }

  const [invitation] = await db
    .select({ id: orgInvitations.id, orgId: orgInvitations.orgId, role: orgInvitations.role })
    .from(orgInvitations)
    .where(eq(orgInvitations.tokenHash, hashToken(token)))
    .limit(1);
  if (!invitation) return { error: "Invitation introuvable." };
  // Ceinture et bretelles : un rôle écrit à la main en base ne doit pas se
  // transformer en superadmin au moment de l'acceptation.
  const role = isRole(invitation.role) ? invitation.role : "viewer";

  await db.transaction(async (tx) => {
    await tx.insert(users).values({
      orgId: invitation.orgId,
      name,
      email: apercu.email,
      passwordHash: await bcrypt.hash(password, 10),
      role,
      // L'invitation A ÉTÉ reçue par courriel : l'adresse est donc déjà
      // prouvée, redemander une activation ferait un second aller-retour pour
      // vérifier ce qu'on vient de vérifier.
      emailVerified: true,
    });
    await tx
      .update(orgInvitations)
      .set({ acceptedAt: new Date() })
      .where(eq(orgInvitations.id, invitation.id));
  });

  return { success: true as const };
}
