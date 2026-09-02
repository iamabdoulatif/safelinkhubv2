"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { bridges, routers } from "@/lib/db/schema";
import { getSession, isSuperAdmin } from "@/lib/auth/session";
import type { RouterOSClient } from "./client";
import { connectToRouter } from "./router-sync";
import { updateRouterUsage, type RouterUsage } from "./link-usage-reader";
import { LINK_TYPES, type LinkType } from "./link-usage";

type Loaded =
  | { ok: false; error: string }
  | { ok: true; db: ReturnType<typeof getDb>; router: typeof routers.$inferSelect };

async function loadRouter(routerId: string): Promise<Loaded> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Non authentifié." };
  const db = getDb();
  const [router] = await db.select().from(routers).where(eq(routers.id, routerId)).limit(1);
  if (!router || (router.orgId !== session.orgId && !isSuperAdmin(session.role))) {
    return { ok: false, error: "Routeur introuvable." };
  }
  return { ok: true, db, router };
}

/** Type d'uplink + quota total du lien + jour de cycle + débit de bridage. */
export async function setRouterLink(
  routerId: string,
  input: {
    linkType?: string | null;
    wanQuotaMb?: number | null;
    billingCycleDay?: number;
    wanThrottleKbps?: number | null;
  },
) {
  const loaded = await loadRouter(routerId);
  if (!loaded.ok) return { error: loaded.error };
  const { db } = loaded;

  const linkType: LinkType | null =
    input.linkType && LINK_TYPES.some((t) => t.value === input.linkType)
      ? (input.linkType as LinkType)
      : input.linkType == null
        ? null
        : loaded.router.linkType as LinkType | null;

  const clampInt = (v: number | null | undefined, min: number, max: number): number | null => {
    if (v == null || !Number.isFinite(v) || v <= 0) return null;
    return Math.max(min, Math.min(max, Math.round(v)));
  };

  await db
    .update(routers)
    .set({
      linkType,
      wanQuotaMb: clampInt(input.wanQuotaMb, 1, 100_000_000),
      billingCycleDay: Math.max(1, Math.min(28, Math.round(input.billingCycleDay ?? loaded.router.billingCycleDay ?? 1))),
      wanThrottleKbps: clampInt(input.wanThrottleKbps, 64, 10_000_000),
    })
    .where(eq(routers.id, routerId));

  revalidatePath(`/admin/router/${routerId}`);
  return { success: true };
}

/** Quota + plafond de débit d'une zone (bridge). */
export async function setZoneUsage(
  routerId: string,
  bridgeId: string,
  input: { zoneQuotaMb?: number | null; zoneCapKbps?: number | null; zonePerClientKbps?: number | null },
) {
  const loaded = await loadRouter(routerId);
  if (!loaded.ok) return { error: loaded.error };
  const { db } = loaded;

  const [bridge] = await db.select().from(bridges).where(eq(bridges.id, bridgeId)).limit(1);
  if (!bridge || bridge.routerId !== routerId) return { error: "Zone introuvable." };

  const clampInt = (v: number | null | undefined, min: number, max: number): number | null => {
    if (v == null || !Number.isFinite(v) || v <= 0) return null;
    return Math.max(min, Math.min(max, Math.round(v)));
  };

  await db
    .update(bridges)
    .set({
      zoneQuotaMb: clampInt(input.zoneQuotaMb, 1, 100_000_000),
      zoneCapKbps: clampInt(input.zoneCapKbps, 64, 10_000_000),
      zonePerClientKbps: clampInt(input.zonePerClientKbps, 64, 10_000_000),
    })
    .where(eq(bridges.id, bridgeId));

  revalidatePath(`/admin/router/${routerId}`);
  return { success: true };
}

/** Relit la conso en direct (connexion + application des brides). */
export async function readRouterUsage(
  routerId: string,
): Promise<{ error: string } | { usage: RouterUsage }> {
  const loaded = await loadRouter(routerId);
  if (!loaded.ok) return { error: loaded.error };
  const { router } = loaded;
  if (!router.host || !router.username || !router.passwordEncrypted) {
    return { error: "Détails de connexion du routeur manquants." };
  }

  let client: RouterOSClient;
  try {
    client = await connectToRouter(router, 20000);
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? `Routeur injoignable : ${err.message}. Il doit être en ligne pour lire la consommation.`
          : "Routeur injoignable (doit être en ligne).",
    };
  }
  try {
    const usage = await updateRouterUsage(client, router);
    revalidatePath(`/admin/router/${routerId}`);
    return { usage };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Lecture impossible." };
  } finally {
    client.close();
  }
}
