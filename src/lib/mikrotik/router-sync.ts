import { and, eq, inArray, isNull, lt, or } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { routers, routerPortForwards } from "@/lib/db/schema";
import { decryptSecret } from "./crypto";
import { openRouterTunnelWithRetry, ensureRouterPortForwards } from "./relay";
import { reconcileWalledGardenOnce } from "./walled-garden";
import { getOrgWalledGardenDisabledHosts } from "./walled-garden-config";
import { ensureHotspotLoginByCode } from "./hotspot-login-mode";
import { persistRouterLoginHost } from "@/lib/portal/router-login-url";
import { enforceRouterSerialOnSync } from "./router-serial-lock";
import { getAppUrl } from "@/lib/net/app-url";
import { RouterOSClient } from "./client";
import { ensureMikhmonTunnelAccess } from "./mikhmon-tunnel-access";
import { ensureSshTunnelAccess } from "./ssh-tunnel-access";
import { isWebAccessService } from "./remote-access-host";

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

  // Routers already known to be offline get a cheaper probe than online ones —
  // no point waiting 60+ seconds on something that is genuinely unreachable.
  // But the budget still has to fit a SUCCESS: opening the relay tunnel takes
  // ~0.3–6s when everything is healthy and intermittently stalls out, so a
  // single 5s attempt could not even outlast a normal handshake. An offline
  // router that had come back therefore kept failing its only probe and stayed
  // marked offline for good, while an install (3 attempts) connected fine —
  // exactly the "joignable mais affiché offline" case. Two attempts at 10s
  // clear a healthy tunnel with room to spare and still bail out fast.
  const isKnownOffline = router.status === "offline";
  const timeoutMs = opts.timeoutMs ?? (isKnownOffline ? 10000 : 20000);
  const maxAttempts = opts.maxAttempts ?? (isKnownOffline ? 2 : 3);

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

    // Captured before we flip the row to "online" below, so the relay-side
    // reconciliation further down can tell a genuine reconnect (or first-ever
    // successful sync) apart from a routine refresh of an already-online router.
    const wasOffline = router.status !== "online";

    // Verrou de série sur TOUS les chemins de mise en service (auto-setup,
    // install VPN/OpenVPN, liaison) : un MikroTik rattaché à un compte ne peut
    // pas être remis en service pour un AUTRE. Armé ici au 1er passage online ;
    // refuse (garde le routeur hors-ligne) si son SN est déjà rattaché ailleurs.
    // Défensif : SN illisible / aléa → autorise (voir enforceRouterSerialOnSync).
    const serialGuard = await enforceRouterSerialOnSync(client, routerId, router.orgId).catch(
      () => ({ ok: true }) as const,
    );
    if (!serialGuard.ok) {
      await db
        .update(routers)
        .set({ status: "offline", lastSyncAt: new Date() })
        .where(eq(routers.id, routerId));
      client.close();
      console.warn(
        JSON.stringify({
          level: "warn",
          msg: "router serial locked to another account — kept offline",
          routerId,
          serial: serialGuard.serial,
        }),
      );
      return {
        success: false,
        error: `Ce MikroTik (série ${serialGuard.serial}) est déjà rattaché à un autre compte. Contactez le support.`,
      };
    }

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

    // Re-apply tunnel-only service repairs if active forwards exist — NAT,
    // firewall allow rules, or legacy Docker bridge cleanup may have been
    // skipped when a forward was first enabled because the router was
    // offline at that time. Repairs are idempotent, so they are safe to call
    // on every successful sync.
    const activeManagedForwards = await db
      .select({
        service: routerPortForwards.service,
        targetPort: routerPortForwards.targetPort,
        publicPort: routerPortForwards.publicPort,
      })
      .from(routerPortForwards)
      .where(
        and(
          eq(routerPortForwards.routerId, routerId),
          eq(routerPortForwards.status, "active"),
        ),
      )
    const activeServices = new Set(activeManagedForwards.map((forward) => forward.service));
    if (activeServices.has("mikhmon")) {
      try {
        await ensureMikhmonTunnelAccess(client);
      } catch {
        // Non-fatal — the port forward on the relay side is still valid,
        // and the NAT rule will be retried on the next successful sync.
      }
    }
    if (activeServices.has("ssh")) {
      try {
        await ensureSshTunnelAccess(client, [], router.username ?? undefined);
      } catch {
        // Non-fatal — the public forward on the relay side is still valid,
        // and the SSH/SFTP input allow rule will be retried on the next sync.
      }
    }

    // Relay-side reconciliation on reconnect: the two repairs above fix the
    // *router* end (NAT/firewall), but the *relay* end — the public
    // publicPort→tunnelIp:targetPort DNAT — is lost if the relay rebooted or
    // its iptables state was flushed while the router was away, leaving every
    // "active" forward dead despite a healthy tunnel. Re-assert them at their
    // recorded ports (idempotent, so a no-op when still present). Gated on
    // wasOffline so an already-online router's routine refreshes don't fire an
    // SSH round-trip to the relay every time.
    if (wasOffline && router.tunnelIp && activeManagedForwards.length > 0) {
      try {
        await ensureRouterPortForwards(
          router.tunnelIp,
          activeManagedForwards.map((forward) => ({
            targetPort: forward.targetPort,
            publicPort: forward.publicPort,
            tlsTerminated: isWebAccessService(forward.service),
          })),
        );
      } catch {
        // Non-fatal — retried on the next reconnect; the router is online
        // regardless, and direct-tunnel access (WireGuard/OpenVPN) still works.
      }
    }

    // Installe/actualise AUTOMATIQUEMENT le walled-garden de paiement sur ce
    // routeur (déjà en service comme neuf) : au plus une fois par process tant
    // que la liste d'hôtes ne change pas. Réutilise la connexion courante.
    try {
      await reconcileWalledGardenOnce(
        client,
        new URL(getAppUrl()).host,
        routerId,
        await getOrgWalledGardenDisabledHosts(router.orgId),
      );
    } catch {
      // Non-fatal — réessayé au prochain sync (routeur sans hotspot, hiccup API).
    }

    // Réaligne AUTOMATIQUEMENT le login-by du profil hotspot actif sur
    // cookie,http-chap,http-pap (login par code + session cookie) — même logique
    // que le walled-garden : un routeur pas passé par l'auto-setup complet (ex.
    // MAMBA WIFI) obtient ainsi le réglage sans intervention, et le garde. Ne
    // réécrit le profil que si la valeur est incomplète (idempotent). Capture
    // aussi le host de login live (dns-name/hotspot-address) et le persiste si la
    // base ne l'a pas → active l'AUTO-CONNEXION du portail. Best-effort.
    try {
      const { loginHost } = await ensureHotspotLoginByCode(client);
      await persistRouterLoginHost(routerId, loginHost);
    } catch {
      // Non-fatal — réessayé au prochain sync (routeur sans hotspot, hiccup API).
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
