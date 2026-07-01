import { and, eq, inArray, isNull, lt, or } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { routers, routerPortForwards } from "@/lib/db/schema";
import { decryptSecret } from "./crypto";
import { openRouterTunnelWithRetry } from "./relay";
import { RouterOSClient } from "./client";
import { getMikhmonTunnelNatCommands } from "./port-forward-rules";

type RouterRow = typeof routers.$inferSelect;

export async function connectToRouter(
  router: RouterRow,
  timeoutMs = 20000,
  maxAttempts = 3,
): Promise<RouterOSClient> {
  if (!router.host || !router.username || !router.passwordEncrypted) {
    throw new Error("Router is missing connection details.");
  }
  const password = decryptSecret(router.passwordEncrypted);
  const client = new RouterOSClient();

  if (router.connectionMethod === "vpn" || router.connectionMethod === "openvpn") {
    const tunnel = await openRouterTunnelWithRetry(
      router.host,
      router.apiPort ?? 8728,
      timeoutMs,
      maxAttempts,
    );
    await client.connectViaStream(tunnel.stream, router.username, password, timeoutMs);
  } else {
    await client.connect(router.host, router.apiPort ?? 8728, router.username, password, timeoutMs);
  }
  return client;
}

function parseUptimeToSeconds(uptime: string): number {
  const regex = /(\d+)(w|d|h|m|s)/g;
  const unitSeconds: Record<string, number> = {
    w: 7 * 24 * 3600,
    d: 24 * 3600,
    h: 3600,
    m: 60,
    s: 1,
  };
  let total = 0;
  let match;
  while ((match = regex.exec(uptime)) !== null) {
    total += Number(match[1]) * unitSeconds[match[2]];
  }
  return total;
}

export async function syncRouterStats(
  routerId: string,
  opts: { timeoutMs?: number; markOfflineOnFailure?: boolean; maxAttempts?: number } = {},
) {
  const markOfflineOnFailure = opts.markOfflineOnFailure ?? true;
  const db = getDb();
  const [router] = await db
    .select()
    .from(routers)
    .where(eq(routers.id, routerId))
    .limit(1);

  if (!router) return { success: false, error: "Router not found." };
  if (!router.host || !router.username || !router.passwordEncrypted) {
    return { success: false, error: "Router is missing connection details." };
  }

  // Routers already known to be offline: use a short timeout and single
  // attempt — no point waiting 60+ seconds for something we already know
  // is unreachable. Online/installing routers keep the generous defaults.
  const isKnownOffline = router.status === "offline";
  const timeoutMs = opts.timeoutMs ?? (isKnownOffline ? 5000 : 20000);
  const maxAttempts = opts.maxAttempts ?? (isKnownOffline ? 1 : 3);

  let client: RouterOSClient;
  try {
    client = await connectToRouter(router, timeoutMs, maxAttempts);
  } catch (err) {
    if (markOfflineOnFailure) {
      await db
        .update(routers)
        .set({ status: "offline", lastSyncAt: new Date() })
        .where(eq(routers.id, routerId));
    }
    return {
      success: false,
      error: err instanceof Error ? `Sync failed: ${err.message}` : "Sync failed.",
    };
  }

  try {
    const [resource] = await client.talk(["/system/resource/print"], timeoutMs);
    const [identityRow] = await client.talk(["/system/identity/print"], timeoutMs);
    const activeUsers = await client.talk(["/ip/hotspot/active/print"], timeoutMs);

    const uptimeSeconds = parseUptimeToSeconds(resource?.uptime ?? "0s");
    const cpuLoad = Number(resource?.["cpu-load"] ?? 0);
    const totalMem = Number(resource?.["total-memory"] ?? 0);
    const freeMem = Number(resource?.["free-memory"] ?? 0);
    const memoryUsage =
      totalMem > 0 ? (((totalMem - freeMem) / totalMem) * 100).toFixed(2) : "0";

    await db
      .update(routers)
      .set({
        status: "online",
        model: resource?.["board-name"] ?? router.model,
        name: identityRow?.name || router.name,
        lastSyncAt: new Date(),
        uptimeSeconds,
        cpuLoad,
        memoryUsage,
        activeUsers: activeUsers.length,
      })
      .where(eq(routers.id, routerId));

    // Re-apply MikHmon NAT rule if an active forward exists — it may have
    // been skipped when the forward was first enabled because the router
    // was offline at that time (ensureMikhmonTunnelNat is a no-op if the
    // rule already exists, so this is safe to call on every successful sync).
    const [mikhmonForward] = await db
      .select({ id: routerPortForwards.id })
      .from(routerPortForwards)
      .where(
        and(
          eq(routerPortForwards.routerId, routerId),
          eq(routerPortForwards.service, "mikhmon"),
          eq(routerPortForwards.status, "active"),
        ),
      )
      .limit(1);
    if (mikhmonForward) {
      try {
        const commands = getMikhmonTunnelNatCommands();
        const existing = await client.talk(commands.findExisting);
        if (existing.length === 0) {
          await client.talk(commands.add);
        }
      } catch {
        // Non-fatal — the port forward on the relay side is still valid,
        // and the NAT rule will be retried on the next successful sync.
      }
    }
  } catch (err) {
    if (markOfflineOnFailure) {
      await db
        .update(routers)
        .set({ status: "offline", lastSyncAt: new Date() })
        .where(eq(routers.id, routerId));
    }
    return {
      success: false,
      error: err instanceof Error ? `Sync failed: ${err.message}` : "Sync failed.",
    };
  } finally {
    client.close();
  }

  return { success: true };
}

/**
 * The Vercel Cron health check only runs once a day on the Hobby plan, so a
 * router whose WireGuard/OpenVPN handshake silently dies can sit shown as
 * "online" for up to 24h. As a cheap complement, pages that display router
 * status call this first: it re-syncs any router whose last successful sync
 * is older than `staleAfterMs`, so simply opening the dashboard self-corrects
 * a stale status instead of waiting for the cron.
 *
 * This must also include routers already marked "offline" — otherwise a
 * router whose tunnel recovers (or one that never had its first successful
 * sync) stays stuck showing offline forever, since nothing else re-checks it.
 */
export async function refreshStaleRouters(orgId: string, staleAfterMs = 5 * 60 * 1000) {
  const db = getDb();
  const cutoff = new Date(Date.now() - staleAfterMs);

  const candidates = await db
    .select({ id: routers.id })
    .from(routers)
    .where(
      and(
        eq(routers.orgId, orgId),
        inArray(routers.status, ["online", "installing", "offline"]),
        or(isNull(routers.lastSyncAt), lt(routers.lastSyncAt, cutoff)),
      ),
    );

  await Promise.all(
    candidates.map((r) => syncRouterStats(r.id, { timeoutMs: 10000, markOfflineOnFailure: true })),
  );
}
