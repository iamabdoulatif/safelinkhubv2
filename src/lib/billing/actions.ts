"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { organizations, users } from "@/lib/db/schema";
import { getSession, isSuperAdmin } from "@/lib/auth/session";
import { isWithinVpnTrial, vpnTrialDaysRemaining, vpnTrialEndsAt } from "./auto-setup-pricing";
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
    };
  }

  return {
    active: isWithinVpnTrial(org.createdAt),
    daysRemaining: vpnTrialDaysRemaining(org.createdAt),
    endsAt: vpnTrialEndsAt(org.createdAt),
    unlimited: false as const,
    quotaMode: "default" as const,
    paidOverride: false,
  };
}

export async function updateOrganizationVpnQuota(formData: FormData) {
  const session = await getSession();
  if (!session || !isSuperAdmin(session.role)) {
    return;
  }

  const userId = String(formData.get("userId") ?? "");
  const grant = String(formData.get("grant") ?? "");
  if (!userId || !isVpnQuotaGrant(grant)) {
    return;
  }

  const db = getDb();
  const [targetUser] = await db
    .select({ orgId: users.orgId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!targetUser) {
    return;
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
}
