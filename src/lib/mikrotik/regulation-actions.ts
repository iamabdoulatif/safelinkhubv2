"use server";

import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { routerRegulation, routerRegulationEvents, routers } from "@/lib/db/schema";
import { getSession, isSuperAdmin } from "@/lib/auth/session";

/** Seuils tels qu'édités à l'écran (Go / minutes), convertis en Mo en base. */
export type RegulationForm = {
  enabled: boolean;
  softCapGo: number;
  hardCapGo: number;
  safety: number;
  dayCriticalRatio: number;
  blockLimit: string;
  abuseThresholdGo: number;
  abuseBlockMinutes: number;
  abuseMaxOffenses: number;
};

export const REGULATION_DEFAULTS: RegulationForm = {
  enabled: false,
  softCapGo: 4608, // 4,5 To
  hardCapGo: 5120, // 5 To
  safety: 0.95,
  dayCriticalRatio: 1.1,
  blockLimit: "64k/64k",
  abuseThresholdGo: 1,
  abuseBlockMinutes: 180,
  abuseMaxOffenses: 3,
};

async function autorise(routerId: string) {
  const session = await getSession();
  if (!session) return null;
  const [router] = await getDb().select().from(routers).where(eq(routers.id, routerId)).limit(1);
  if (!router || (router.orgId !== session.orgId && !isSuperAdmin(session.role))) return null;
  return router;
}

export async function readRouterRegulation(routerId: string) {
  if (!(await autorise(routerId))) return { error: "Routeur introuvable." };
  const db = getDb();
  const [row] = await db.select().from(routerRegulation).where(eq(routerRegulation.routerId, routerId)).limit(1);
  const events = await db
    .select()
    .from(routerRegulationEvents)
    .where(eq(routerRegulationEvents.routerId, routerId))
    .orderBy(desc(routerRegulationEvents.createdAt))
    .limit(20);
  const form: RegulationForm = row
    ? {
        enabled: row.enabled,
        softCapGo: row.softCapMb / 1024,
        hardCapGo: row.hardCapMb / 1024,
        safety: Number(row.safety),
        dayCriticalRatio: Number(row.dayCriticalRatio),
        blockLimit: row.blockLimit,
        abuseThresholdGo: row.abuseThresholdMb / 1024,
        abuseBlockMinutes: row.abuseBlockMinutes,
        abuseMaxOffenses: row.abuseMaxOffenses,
      }
    : REGULATION_DEFAULTS;
  return {
    form,
    configured: Boolean(row),
    state: row?.state ?? null,
    watch: row?.watch ?? {},
    updatedAt: row?.updatedAt?.toISOString() ?? null,
    events: events.map((e) => ({ id: e.id, kind: e.kind, payload: e.payload, at: e.createdAt.toISOString() })),
  };
}

export async function saveRouterRegulation(routerId: string, f: RegulationForm) {
  if (!(await autorise(routerId))) return { error: "Routeur introuvable." };
  if (!(f.softCapGo > 0) || !(f.hardCapGo >= f.softCapGo)) {
    return { error: "Le plafond absolu doit être supérieur ou égal à la cible mensuelle." };
  }
  if (!/^(\d+(?:\.\d+)?[kMG]?)\/(\d+(?:\.\d+)?[kMG]?)$/.test(f.blockLimit.trim())) {
    return { error: "Débit plancher attendu au format RouterOS « 64k/64k »." };
  }
  if (!(f.safety > 0 && f.safety <= 1) || !(f.dayCriticalRatio >= 1)) {
    return { error: "Marge entre 0 et 1, avance tolérée ≥ 1." };
  }
  const values = {
    enabled: f.enabled,
    softCapMb: Math.round(f.softCapGo * 1024),
    hardCapMb: Math.round(f.hardCapGo * 1024),
    safety: f.safety.toFixed(3),
    dayCriticalRatio: f.dayCriticalRatio.toFixed(3),
    blockLimit: f.blockLimit.trim(),
    abuseThresholdMb: Math.max(1, Math.round(f.abuseThresholdGo * 1024)),
    abuseBlockMinutes: Math.max(1, Math.round(f.abuseBlockMinutes)),
    abuseMaxOffenses: Math.max(1, Math.round(f.abuseMaxOffenses)),
    updatedAt: new Date(),
  };
  await getDb()
    .insert(routerRegulation)
    .values({ routerId, ...values })
    .onConflictDoUpdate({ target: routerRegulation.routerId, set: values });
  revalidatePath(`/admin/router/${routerId}`);
  return { ok: true as const };
}
