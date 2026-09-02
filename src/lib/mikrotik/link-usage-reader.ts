/**
 * Lecture + application du contrôle de conso sur le routeur (I/O RouterOS).
 * La logique de comptage est PURE dans link-usage.ts ; ici on ne fait que lire
 * les compteurs, persister l'accumulateur, et poser/retirer les files de
 * bridage. Appelé à chaque sync (suivi automatique) et par le bouton « Relire ».
 */
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { bridges, routers } from "@/lib/db/schema";
import type { RouterOSClient } from "./client";
import { detectUplinkInterface } from "./router-lock";
import {
  accumulate,
  mbpsToKbps,
  quotaVerdict,
  type UsageAccumulator,
} from "./link-usage";

const WAN_CAP_QUEUE = "SafeLinkHub-wan-cap";
const zoneQueueName = (bridgeName: string) => `SafeLinkHub-zone-${bridgeName}`;

type Router = typeof routers.$inferSelect;
type Bridge = typeof bridges.$inferSelect;

/** rx-byte + tx-byte d'une interface, ou null si introuvable. */
async function readIfaceBytes(
  client: RouterOSClient,
  name: string,
  timeoutMs: number,
): Promise<number | null> {
  const rows = await client
    .talk(["/interface/print", "=stats=", `?name=${name}`], timeoutMs)
    .catch(() => [] as Record<string, string>[]);
  const r = rows[0];
  if (!r) return null;
  const rx = Number(r["rx-byte"] ?? 0);
  const tx = Number(r["tx-byte"] ?? 0);
  if (!Number.isFinite(rx) || !Number.isFinite(tx)) return null;
  return rx + tx;
}

/**
 * Pose ou retire une file simple STATIQUE de bridage (max-limit) sur une cible.
 * `kbps=null` → on retire la file. Idempotent, best-effort. Placée en tête pour
 * primer sur les files hotspot dynamiques (1re correspondance gagne).
 */
async function applyCapQueue(
  client: RouterOSClient,
  name: string,
  target: string,
  kbps: number | null,
  timeoutMs: number,
): Promise<void> {
  const existing = (
    await client.talk(["/queue/simple/print", `?name=${name}`], timeoutMs).catch(() => [])
  )[0];

  if (kbps === null) {
    if (existing?.[".id"] && existing.dynamic !== "true") {
      await client.talk(["/queue/simple/remove", `=numbers=${existing[".id"]}`], timeoutMs).catch(() => {});
    }
    return;
  }

  const limit = `${kbps}k/${kbps}k`;
  if (existing?.[".id"] && existing.dynamic !== "true") {
    await client
      .talk(["/queue/simple/set", `=numbers=${existing[".id"]}`, `=max-limit=${limit}`, "=disabled=no"], timeoutMs)
      .catch(() => {});
    return;
  }
  const all = await client.talk(["/queue/simple/print"], timeoutMs).catch(() => []);
  const first = all.find((q) => q[".id"]);
  const add = [
    "/queue/simple/add",
    `=name=${name}`,
    `=target=${target}`,
    `=max-limit=${limit}`,
    "=comment=SafeLinkHub plafond conso",
  ];
  if (first?.[".id"]) add.push(`=place-before=${first[".id"]}`);
  await client.talk(add, timeoutMs).catch(() => {});
}

export type ZoneUsage = {
  bridgeId: string;
  name: string;
  usedBytes: number;
  quotaMb: number | null;
  capKbps: number | null;
  pct: number;
  state: ReturnType<typeof quotaVerdict>["state"];
  throttled: boolean;
};

export type RouterUsage = {
  linkType: string | null;
  wan: {
    interface: string | null;
    usedBytes: number;
    quotaMb: number | null;
    throttleKbps: number | null;
    pct: number;
    state: ReturnType<typeof quotaVerdict>["state"];
    throttled: boolean;
    cycleStartedAt: Date | null;
    /** true si le quota vient de franchir 80 % pour la 1re fois de ce cycle. */
    crossedWarn: boolean;
  };
  zones: ZoneUsage[];
};

/**
 * Met à jour la conso du routeur ET de ses zones, applique/retire les brides
 * selon les quotas, et renvoie l'état. Best-effort : une lecture ratée n'écrit
 * rien (on ne veut jamais compter un relevé bidon).
 */
export async function updateRouterUsage(
  client: RouterOSClient,
  router: Router,
  opts: { timeoutMs?: number } = {},
): Promise<RouterUsage> {
  const timeoutMs = opts.timeoutMs ?? 15000;
  const db = getDb();
  const now = new Date();
  const billingDay = router.billingCycleDay ?? 1;

  // ── WAN ──
  const wanIface = await detectUplinkInterface(client, timeoutMs);
  const wanState: RouterUsage["wan"] = {
    interface: wanIface,
    usedBytes: router.wanUsedBytes ?? 0,
    quotaMb: router.wanQuotaMb ?? null,
    throttleKbps: router.wanThrottleKbps ?? null,
    pct: 0,
    state: "unlimited",
    throttled: Boolean(router.wanThrottledAt),
    cycleStartedAt: router.wanCycleStartedAt ?? null,
    crossedWarn: false,
  };

  if (wanIface) {
    const raw = await readIfaceBytes(client, wanIface, timeoutMs);
    if (raw !== null) {
      const prev: UsageAccumulator = {
        usedBytes: router.wanUsedBytes ?? 0,
        lastRaw: router.wanLastRaw ?? 0,
        cycleStartedAt: router.wanCycleStartedAt ?? null,
      };
      const next = accumulate(prev, raw, now, billingDay);
      const verdict = quotaVerdict(next.usedBytes, router.wanQuotaMb ?? null);

      // Bridage : posé quand on dépasse ET qu'un débit de bride est défini ;
      // retiré quand on repasse sous le quota ou au nouveau cycle.
      const wantThrottle = verdict.state === "over" && router.wanThrottleKbps ? router.wanThrottleKbps : null;
      if (wantThrottle) await applyCapQueue(client, WAN_CAP_QUEUE, wanIface, wantThrottle, timeoutMs);
      else await applyCapQueue(client, WAN_CAP_QUEUE, wanIface, null, timeoutMs);

      // Alerte à 80 % : une seule fois par cycle (posée ici, effacée au rollover).
      const alertedThisCycle = Boolean(router.wanQuotaAlertedAt);
      const crossedWarn = verdict.state !== "ok" && verdict.state !== "unlimited" && !alertedThisCycle;

      await db
        .update(routers)
        .set({
          wanUsedBytes: next.usedBytes,
          wanLastRaw: next.lastRaw,
          wanCycleStartedAt: next.cycleStartedAt,
          wanThrottledAt: wantThrottle ? (router.wanThrottledAt ?? now) : null,
          wanQuotaAlertedAt: next.rolledOver ? null : crossedWarn ? now : router.wanQuotaAlertedAt,
        })
        .where(eq(routers.id, router.id));

      wanState.usedBytes = next.usedBytes;
      wanState.pct = verdict.pct;
      wanState.state = verdict.state;
      wanState.throttled = Boolean(wantThrottle);
      wanState.cycleStartedAt = next.cycleStartedAt;
      wanState.crossedWarn = next.rolledOver ? false : crossedWarn;
    }
  }

  // ── Zones (bridges hotspot) ──
  const zoneRows: Bridge[] = await db.select().from(bridges).where(eq(bridges.routerId, router.id));
  const zones: ZoneUsage[] = [];
  for (const b of zoneRows) {
    const raw = await readIfaceBytes(client, b.name, timeoutMs);
    let usedBytes = b.zoneUsedBytes ?? 0;
    if (raw !== null) {
      const next = accumulate(
        { usedBytes: b.zoneUsedBytes ?? 0, lastRaw: b.zoneLastRaw ?? 0, cycleStartedAt: b.zoneCycleStartedAt ?? null },
        raw,
        now,
        billingDay,
      );
      usedBytes = next.usedBytes;
      await db
        .update(bridges)
        .set({ zoneUsedBytes: next.usedBytes, zoneLastRaw: next.lastRaw, zoneCycleStartedAt: next.cycleStartedAt })
        .where(eq(bridges.id, b.id));
    }

    const verdict = quotaVerdict(usedBytes, b.zoneQuotaMb ?? null);
    // Débit de zone : le plafond fixe (zoneCapKbps) s'applique toujours ; si le
    // quota est dépassé, on tombe au débit de bride du WAN (ou on garde le cap).
    const baseCap = b.zoneCapKbps ?? null;
    const overCap = verdict.state === "over" ? (router.wanThrottleKbps ?? baseCap) : baseCap;
    const effectiveCap = overCap ?? baseCap;
    await applyCapQueue(client, zoneQueueName(b.name), b.name, effectiveCap, timeoutMs);

    zones.push({
      bridgeId: b.id,
      name: b.name,
      usedBytes,
      quotaMb: b.zoneQuotaMb ?? null,
      capKbps: b.zoneCapKbps ?? null,
      pct: verdict.pct,
      state: verdict.state,
      throttled: verdict.state === "over" && Boolean(overCap),
    });
  }

  return { linkType: router.linkType ?? null, wan: wanState, zones };
}

export { WAN_CAP_QUEUE, zoneQueueName, mbpsToKbps };
