import { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { bridges, organizations, routers } from "@/lib/db/schema";
import { hashToken } from "@/lib/mikrotik/install-token";
import { walledGardenScriptLines } from "@/lib/mikrotik/walled-garden";

function buildBootstrapScript(opts: {
  appHost: string;
  callbackUrl: string;
  callbackMode: "http" | "https";
  bootstrapToken: string;
  bridgeName: string;
  gatewayIp: string;
}) {
  return `# SafeLinkHub hotspot bootstrap - auto-generated, do not edit
:log info "*** SafeLinkHub Bootstrap Starting ***"

${walledGardenScriptLines(opts.appHost)}

:log info "Walled garden entries deployed"

:delay 2s
:do {
  /tool fetch url="${opts.callbackUrl}" http-header-field="Authorization: Bearer ${opts.bootstrapToken}" mode=${opts.callbackMode} output=none
  :log info "SafeLinkHub server notified that bootstrap completed for bridge ${opts.bridgeName}"
} on-error={ :log warning "SafeLinkHub server bootstrap completion notification failed" }

:log info "*** SafeLinkHub Bootstrap Finished ***"
`;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return new Response("Missing bearer token", { status: 401 });
  }

  const db = getDb();
  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.slug, slug))
    .limit(1);
  if (!org) {
    return new Response("Unknown organization", { status: 404 });
  }

  const tokenHash = hashToken(token);
  const orgRouters = await db
    .select({ id: routers.id })
    .from(routers)
    .where(eq(routers.orgId, org.id));
  const routerIds = orgRouters.map((r) => r.id);

  const [bridge] = routerIds.length
    ? await db
        .select()
        .from(bridges)
        .where(
          and(
            eq(bridges.bootstrapTokenHash, tokenHash),
            eq(bridges.bootstrapStatus, "pending"),
          ),
        )
        .limit(1)
    : [];

  if (!bridge || !routerIds.includes(bridge.routerId)) {
    return new Response("Invalid or already-used bootstrap token", { status: 403 });
  }
  if (!bridge.bootstrapTokenExpiresAt || bridge.bootstrapTokenExpiresAt < new Date()) {
    return new Response("Bootstrap token has expired", { status: 403 });
  }

  const appUrl = request.nextUrl.origin;
  const appHost = request.nextUrl.host;
  const callbackUrl = new URL(
    `/api/router/v1/${org.slug}/scripts/bootstrap/installed`,
    appUrl,
  ).toString();

  const script = buildBootstrapScript({
    appHost,
    callbackUrl,
    callbackMode: callbackUrl.startsWith("https://") ? "https" : "http",
    bootstrapToken: token,
    bridgeName: bridge.name,
    gatewayIp: bridge.gatewayIp,
  });

  return new Response(script, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
