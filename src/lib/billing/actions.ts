"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { organizations, routers, users } from "@/lib/db/schema";
import { getSession, isSuperAdmin } from "@/lib/auth/session";
import { isWithinVpnTrial, vpnTrialDaysFor, vpnTrialDaysRemaining, vpnTrialEndsAt } from "./auto-setup-pricing";
import {
  computeVpnQuotaGrant,
  getVpnQuotaStatus,
  isVpnQuotaGrant,
  ROUTER_QUOTA_INHERIT,
  type VpnQuotaGrant,
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
  // Vide = quota de l'organisation entière (comportement historique). Sinon un
  // routeur précis du compte : une organisation peut porter plusieurs zones et
  // n'en avoir qu'une offerte.
  const routerId = String(formData.get("routerId") ?? "");
  const inherit = grant === ROUTER_QUOTA_INHERIT;
  if (!userId || (!isVpnQuotaGrant(grant) && !inherit)) {
    return { success: false, error: "Sélection invalide." };
  }
  if (inherit && !routerId) {
    return { success: false, error: "« Suivre l'organisation » ne vaut que pour un routeur." };
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

  if (routerId) {
    // Le routeur doit appartenir à l'organisation de l'utilisateur visé :
    // sans ce contrôle, un identifiant recopié à la main offrirait un accès
    // sur le routeur d'un AUTRE client.
    const [targetRouter] = await db
      .select({ id: routers.id })
      .from(routers)
      .where(and(eq(routers.id, routerId), eq(routers.orgId, targetUser.orgId)))
      .limit(1);
    if (!targetRouter) {
      return { success: false, error: "Routeur introuvable pour cette organisation." };
    }

    // null = ce routeur suit de nouveau son organisation.
    const patch = inherit ? { mode: null, expiresAt: null } : computeVpnQuotaGrant(grant as VpnQuotaGrant);
    await db
      .update(routers)
      .set({ vpnQuotaMode: patch.mode, vpnQuotaExpiresAt: patch.expiresAt })
      .where(eq(routers.id, routerId));
  } else {
    const patch = computeVpnQuotaGrant(grant as VpnQuotaGrant);
    await db
      .update(organizations)
      .set({
        vpnQuotaMode: patch.mode,
        vpnQuotaExpiresAt: patch.expiresAt,
      })
      .where(eq(organizations.id, targetUser.orgId));
  }

  revalidatePath("/admin/users");
  revalidatePath("/admin/remote-access");
  revalidatePath("/admin/billing");

  return { success: true };
}
