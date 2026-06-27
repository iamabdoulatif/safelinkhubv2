"use server";

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { organizations } from "@/lib/db/schema";
import { getSession, isSuperAdmin } from "@/lib/auth/session";
import { isWithinVpnTrial, vpnTrialDaysRemaining, vpnTrialEndsAt } from "./auto-setup-pricing";

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
    .select({ createdAt: organizations.createdAt })
    .from(organizations)
    .where(eq(organizations.id, session.orgId))
    .limit(1);
  if (!org) return null;

  return {
    active: isWithinVpnTrial(org.createdAt),
    daysRemaining: vpnTrialDaysRemaining(org.createdAt),
    endsAt: vpnTrialEndsAt(org.createdAt),
    unlimited: false as const,
  };
}
