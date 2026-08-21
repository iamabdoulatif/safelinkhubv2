"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { organizations, users } from "@/lib/db/schema";
import { getSession, isSuperAdmin } from "@/lib/auth/session";
import { isWithinVpnTrial, vpnTrialDaysFor, vpnTrialDaysRemaining, vpnTrialEndsAt } from "./auto-setup-pricing";
import {
  computeVpnQuotaGrant,
  getVpnQuotaStatus,
  isVpnQuotaGrant,
} from "./vpn-quota";

export async function getVpnTrialStatus() {
  const session = await getSession();
  if (!session) return null;

  // Superadmins are unlimited by role, not by org-level trial state —
  // reported separately so the UI can show "Compte illimité" instead of
  // a trial countdown that doesn't actually apply to them.
  if (isSuperAdmin(session.role)) {
    return { active: true, daysRemaining: Infinity, endsAt: null, unlimited: true as const };
  }

  const db = getDb();
  const [org] = await db
    .select({
      createdAt: organizations.createdAt,
      vpnQuotaMode: organizations.vpnQuotaMode,
      vpnQuotaExpiresAt: organizations.vpnQuotaExpiresAt,
    })
    .from(organizations)
    .where(eq(organizations.id, session.orgId))
    .limit(1);
  if (!org) return null;

  const quota = getVpnQuotaStatus(org);
  if (quota.free || quota.paidOverride) {
    return {
      active: quota.free,
      daysRemaining: quota.daysRemaining,
      endsAt: quota.expiresAt,
      unlimited: quota.unlimited,
      quotaMode: quota.mode,
      paidOverride: quota.paidOverride,
      // Durée de l'essai DUE à cette organisation — 30 jours depuis la bascule
      // du 21/08/2026, 10 avant. Annoncer la durée courante à tout le monde
      // promettrait 30 jours à des comptes qui n'en ont eu que 10.
      totalDays: vpnTrialDaysFor(org.createdAt),
    };
  }

  return {
    active: isWithinVpnTrial(org.createdAt),
    daysRemaining: vpnTrialDaysRemaining(org.createdAt),
    endsAt: vpnTrialEndsAt(org.createdAt),
    unlimited: false as const,
    quotaMode: "default" as const,
    paidOverride: false,
    totalDays: vpnTrialDaysFor(org.createdAt),
  };
}

export type UpdateVpnQuotaState = { success: true } | { success: false; error: string } | null;

export async function updateOrganizationVpnQuota(
  _prevState: UpdateVpnQuotaState,
  formData: FormData,
): Promise<UpdateVpnQuotaState> {
  const session = await getSession();
  if (!session || !isSuperAdmin(session.role)) {
    return { success: false, error: "Action non autorisée." };
  }

  const userId = String(formData.get("userId") ?? "");
  const grant = String(formData.get("grant") ?? "");
  if (!userId || !isVpnQuotaGrant(grant)) {
    return { success: false, error: "Sélection invalide." };
  }

  const db = getDb();
  const [targetUser] = await db
    .select({ orgId: users.orgId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!targetUser) {
    return { success: false, error: "Utilisateur introuvable." };
  }

  const patch = computeVpnQuotaGrant(grant);
  await db
    .update(organizations)
    .set({
      vpnQuotaMode: patch.mode,
      vpnQuotaExpiresAt: patch.expiresAt,
    })
    .where(eq(organizations.id, targetUser.orgId));

  revalidatePath("/admin/users");
  revalidatePath("/admin/remote-access");
  revalidatePath("/admin/billing");

  return { success: true };
}
