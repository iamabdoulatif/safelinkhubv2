import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { routerMikhmonCloudInstances, routers, routerPortForwards } from "@/lib/db/schema";
import { getRelayPublicHost } from "@/lib/mikrotik/relay";
import { buildRelayNginxConfig } from "@/lib/mikrotik/relay-nginx";
import { isWebAccessService } from "@/lib/mikrotik/remote-access-host";

export const dynamic = "force-dynamic";

/**
 * Emits the nginx config that TLS-terminates every active browser-access
 * forward (WebFig/MikHmon) on its public port and proxies to the router's
 * tunnel IP. A systemd timer on the relay curls this, writes
 * /etc/nginx/conf.d/slh-forwards.conf and reloads nginx, so new forwards start
 * serving HTTPS without any manual step. WinBox/SSH are untouched (raw DNAT).
 */
export async function GET(request: NextRequest) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const db = getDb();
  const [rows, cloudInstances] = await Promise.all([
    db
      .select({
        routerId: routerPortForwards.routerId,
        service: routerPortForwards.service,
        tunnelIp: routerPortForwards.tunnelIp,
        targetPort: routerPortForwards.targetPort,
        publicPort: routerPortForwards.publicPort,
        shard: routers.relayShard,
      })
      .from(routerPortForwards)
      .innerJoin(routers, eq(routerPortForwards.routerId, routers.id))
      .where(eq(routerPortForwards.status, "active")),
    db.select().from(routerMikhmonCloudInstances),
  ]);
  const cloudRouterIds = new Set(
    cloudInstances.filter((instance) => instance.status === "active").map((instance) => instance.routerId),
  );
  const webForwards = rows
    .filter(
      (row): row is typeof row & { tunnelIp: string } =>
        isWebAccessService(row.service) &&
        Boolean(row.tunnelIp) &&
        !(row.service === "mikhmon" && cloudRouterIds.has(row.routerId)),
    )
    .map((row) => ({
      publicPort: row.publicPort,
      targetPort: row.targetPort,
      tunnelIp: row.tunnelIp,
      relayHost: getRelayPublicHost(row.shard),
    }));
  const conf = buildRelayNginxConfig({ webForwards });
  return new Response(conf, { headers: { "content-type": "text/plain" } });
}
