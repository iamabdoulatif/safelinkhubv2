"use server";

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { organizations } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import { isWithinVpnTrial, vpnTrialDaysRemaining, vpnTrialEndsAt } from "./auto-setup-pricing";

export async function getVpnTrialStatus() {
  const session = await getSession();
  if (!session) return null;

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
  };
}
