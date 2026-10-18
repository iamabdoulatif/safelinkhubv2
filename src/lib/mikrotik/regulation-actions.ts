"use server";

import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { routerRegulation, routerRegulationEvents, routers } from "@/lib/db/schema";
import { getSession, isSuperAdmin } from "@/lib/auth/session";
import { REGULATION_DEFAULTS, type RegulationForm } from "./regulation-defaults";
import { can } from "@/lib/auth/roles";
import { validateFupLinks, calculateFupBudget, fupUptimeSeconds, type FupLink, type FupLedger } from "./starlink-fup";
import { connectToRouter } from "./router-sync";
import { readIfaceBytes } from "./link-usage-reader";
import { runStarlinkFup, stopStarlinkFup } from "./starlink-fup-service";

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
        profileThrottlePct: row.profileThrottlePct,
        abuseThrottleLimit: row.abuseThrottleLimit,
      }
    : REGULATION_DEFAULTS;
  return {
    form,
    configured: Boolean(row),
    state: row?.state ?? null,
    watch: row?.watch ?? {},
    updatedAt: row?.updatedAt?.toISOString() ?? null,
    fupLinks: row?.fupLinks ?? [],
    fupLedger: row?.fupLedger ?? {},
    fupPooled: row?.fupPooled ?? false,
    fupMode: row?.fupMode ?? "observation",
    fupRuntime: row?.fupRuntime ?? null,
    fupBudgets: (row?.fupLinks ?? []).map(link => ({ id: link.id, ...calculateFupBudget(link, row?.fupLedger?.[link.id] ?? null, new Date()) })),
    events: events.map((e) => ({ id: e.id, kind: e.kind, payload: e.payload, at: e.createdAt.toISOString() })),
  };
}

export async function saveRouterRegulation(routerId: string, f: RegulationForm) {
  if (!(await autorise(routerId))) return { error: "Routeur introuvable." };
  const session = await getSession();
  if (!session || !can(session.role, "routers")) return { error: "Modification du routeur non autorisée." };
  const [current] = await getDb().select().from(routerRegulation).where(eq(routerRegulation.routerId, routerId)).limit(1);
  if (current?.fupLinks?.length) return { error: "FUP par liaison configuré : les anciennes règles sont verrouillées." };
  if (!(f.softCapGo > 0) || !(f.hardCapGo >= f.softCapGo)) {
    return { error: "Le plafond absolu doit être supérieur ou égal à la cible mensuelle." };
  }
  const DEBIT = /^(\d+(?:\.\d+)?[kMG]?)\/(\d+(?:\.\d+)?[kMG]?)$/;
  if (!DEBIT.test(f.blockLimit.trim())) {
    return { error: "Débit plancher attendu au format RouterOS « 64k/64k »." };
  }
  if (!DEBIT.test((f.abuseThrottleLimit ?? "").trim())) {
    return { error: "Débit du bridage attendu au format RouterOS « 256k/256k »." };
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
    profileThrottlePct: Math.min(100, Math.max(0, Math.round(f.profileThrottlePct ?? 0))),
    abuseThrottleLimit: (f.abuseThrottleLimit ?? "256k/256k").trim(),
    updatedAt: new Date(),
  };
  await getDb()
    .insert(routerRegulation)
    .values({ routerId, ...values })
    .onConflictDoUpdate({ target: routerRegulation.routerId, set: values });
  revalidatePath(`/admin/router/${routerId}`);
  return { ok: true as const };
}

/** Configures observation only. No enabling of legacy limits and no router writes. */
export async function saveStarlinkFupLinks(routerId: string, links: FupLink[]) {
  const session = await getSession();
  if (!session || !can(session.role, "routers") || !(await autorise(routerId))) return { error: "Routeur introuvable ou modification non autorisée." };
  const invalid = validateFupLinks(links);
  if (invalid) return { error: invalid };
  const db = getDb();
  const result = await db.transaction(async tx => {
    const [row] = await tx.select().from(routerRegulation).where(eq(routerRegulation.routerId, routerId)).for("update");
    if (!row) return { error: "Enregistrez d'abord les seuils, régulation désactivée." };
    if (row.fupMode === "active") return { error: "Désactivez le FUP avant de modifier les liaisons." };
    if (row.enabled || (row.state && !row.state.released)) return { error: "Désactivez l'ancienne régulation et attendez le nettoyage du routeur avant de configurer le FUP." };
    if (row.fupPooled && links.length < 2) return { error: "Désactivez le cumul avant de retirer une liaison." };
    const ledger: Record<string, FupLedger> = {};
    for (const l of links) {
      const previous = row.fupLinks?.find(p => p.id === l.id);
      if (previous && previous.interface === l.interface && previous.cycleStart === l.cycleStart && previous.cycleEnd === l.cycleEnd && row.fupLedger?.[l.id]) ledger[l.id] = row.fupLedger[l.id];
    }
    await tx.update(routerRegulation).set({ fupLinks: links, fupLedger: ledger, updatedAt: new Date() }).where(eq(routerRegulation.routerId, routerId));
    return { ok: true as const };
  });
  revalidatePath(`/admin/router/${routerId}`);
  return result;
}

export async function setStarlinkFupActive(routerId: string, active: boolean) {
  const session = await getSession();
  if (!session || !can(session.role, "routers") || !(await autorise(routerId))) return { error: "Modification non autorisée." };
  try {
    if (active) await runStarlinkFup(routerId, true);
    else await stopStarlinkFup(routerId);
    revalidatePath(`/admin/router/${routerId}`);
    return { ok: true as const };
  } catch (e) { return { error: e instanceof Error ? e.message : "Application FUP impossible." }; }
}

/** Anchor a recent operator-confirmed provider reading to a live WAN sample. */
export async function reconcileStarlinkBaseline(routerId: string, linkId: string, usedGB: number, measuredAt: string) {
  const session = await getSession();
  const router = await autorise(routerId);
  if (!session || !can(session.role, "routers") || !router) return { error: "Modification non autorisée." };
  const age = Date.now() - Date.parse(measuredAt);
  if (!Number.isFinite(usedGB) || usedGB < 0 || !Number.isSafeInteger(Math.round(usedGB * 1e9)) || !Number.isFinite(age) || age < 0 || age > 180000) return { error: "Relevé Starlink récent (moins de 3 minutes) et volume positif requis." };
  const db = getDb();
  const [row] = await db.select().from(routerRegulation).where(eq(routerRegulation.routerId, routerId)).limit(1);
  const link = row?.fupLinks?.find(l => l.id === linkId);
  if (!link || !link.cycleConfirmed || Date.now() < Date.parse(link.cycleStart) || Date.now() >= Date.parse(link.cycleEnd)) return { error: "Cycle de données non confirmé ou expiré." };
  const client = await connectToRouter(router, 20000);
  try {
    const raw = await readIfaceBytes(client, link.interface, 15000);
    if (raw === null) return { error: "Compteur WAN illisible : référence non enregistrée." };
    const [resource] = await client.talk(["/system/resource/print", "=.proplist=uptime"], 15000);
    const uptimeSeconds = fupUptimeSeconds(resource?.uptime);
    if (uptimeSeconds === undefined) return { error: "Durée de fonctionnement illisible : référence non enregistrée." };
    const at = new Date().toISOString();
    const result = await db.transaction(async tx => {
      const [current] = await tx.select().from(routerRegulation).where(eq(routerRegulation.routerId, routerId)).for("update");
      if (!current || JSON.stringify(current.fupLinks) !== JSON.stringify(row.fupLinks)) return { error: "Configuration modifiée pendant la lecture, recommencez." };
      // Never overwrite a newer counter sample with an older anchor.
      if (current.fupLedger?.[linkId] && Date.parse(current.fupLedger[linkId].at) >= Date.parse(at)) return { error: "Un relevé plus récent existe déjà, recommencez." };
      await tx.update(routerRegulation).set({ fupLedger: { ...current.fupLedger,
        [linkId]: { cycleStart: link.cycleStart, cycleEnd: link.cycleEnd, cycleUsedBytes: Math.round(usedGB * 1e9), rawBytes: raw, at, baselineAt: at, baselineConfirmed: true, uptimeSeconds },
      } }).where(eq(routerRegulation.routerId, routerId));
      await tx.insert(routerRegulationEvents).values({ routerId, kind: "fup_baseline", payload: { linkId, usedGB, measuredAt, actor: session.userId } });
      return { ok: true as const };
    });
    revalidatePath(`/admin/router/${routerId}`);
    return result;
  } finally { client.close(); }
}

/** Change the management envelope without changing activation or resetting counters. */
export async function setStarlinkFupPooled(routerId: string, pooled: boolean) {
  const session = await getSession();
  if (!session || !can(session.role, "routers") || !(await autorise(routerId))) return { error: "Modification non autorisée." };
  if (typeof pooled !== "boolean") return { error: "Mode FUP invalide." };
  const result = await getDb().transaction(async tx => {
    const [row] = await tx.select().from(routerRegulation).where(eq(routerRegulation.routerId, routerId)).for("update");
    if (!row || row.fupMode === "active") return { error: "Désactivez le FUP avant de changer son enveloppe." };
    if (pooled && (row.fupLinks?.length ?? 0) < 2) return { error: "Configurez au moins deux liaisons avant de cumuler les quotas." };
    await tx.update(routerRegulation).set({ fupPooled: pooled, updatedAt: new Date() }).where(eq(routerRegulation.routerId, routerId));
    await tx.insert(routerRegulationEvents).values({ routerId, kind: "fup_pool_configured", payload: { pooled, actor: session.userId } });
    return { ok: true as const };
  });
  revalidatePath(`/admin/router/${routerId}`);
  return result;
}
