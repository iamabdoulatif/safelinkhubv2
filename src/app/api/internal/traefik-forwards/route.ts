import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { routerPortForwards } from "@/lib/db/schema";
import { isWebAccessService, webAccessSubdomain } from "@/lib/mikrotik/remote-access-host";

export const dynamic = "force-dynamic";

/**
 * Emits the Traefik dynamic (file-provider) config that publishes every active
 * browser-access forward (WebFig/MikHmon) over HTTPS at
 * <subdomain>.<RELAY_BASE_DOMAIN>, terminating TLS with the wildcard cert and
 * proxying to the router's tunnel IP. A systemd timer on the relay curls this
 * and writes /docker/traefik/dynamic/forwards.yml, so new forwards register
 * themselves without any per-forward SSH or Traefik restart.
 */
export async function GET(request: NextRequest) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const base = process.env.RELAY_BASE_DOMAIN;
  if (!base) {
    // Sharding/TLS not enabled — nothing to publish.
    return new Response("http: {}\n", { headers: { "content-type": "text/plain" } });
  }

  const db = getDb();
  const forwards = await db
    .select({
      service: routerPortForwards.service,
      tunnelIp: routerPortForwards.tunnelIp,
      targetPort: routerPortForwards.targetPort,
    })
    .from(routerPortForwards)
    .where(eq(routerPortForwards.status, "active"));

  const web = forwards.filter((f) => isWebAccessService(f.service) && f.tunnelIp);
  // Dedupe on the derived label so two forwards that map to the same host
  // (shouldn't happen, but be safe) don't produce duplicate Traefik keys.
  const seen = new Set<string>();
  const routers: string[] = [];
  const services: string[] = [];
  for (const f of web) {
    const label = webAccessSubdomain(f.tunnelIp!, f.service);
    if (seen.has(label)) continue;
    seen.add(label);
    routers.push(
      `    ${label}:\n` +
        `      rule: "Host(\`${label}.${base}\`)"\n` +
        `      entryPoints: [websecure]\n` +
        `      service: ${label}\n` +
        `      tls:\n` +
        `        certResolver: cloudflare\n` +
        `        domains:\n` +
        `          - main: "*.${base}"`,
    );
    services.push(
      `    ${label}:\n` +
        `      loadBalancer:\n` +
        `        servers:\n` +
        `          - url: "http://${f.tunnelIp}:${f.targetPort}"`,
    );
  }

  const yaml =
    routers.length === 0
      ? "http: {}\n"
      : `http:\n  routers:\n${routers.join("\n")}\n  services:\n${services.join("\n")}\n`;

  return new Response(yaml, { headers: { "content-type": "text/plain" } });
}
