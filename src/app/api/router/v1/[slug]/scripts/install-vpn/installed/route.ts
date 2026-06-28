import { and, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { organizations, routers } from "@/lib/db/schema";
import { hashToken } from "@/lib/mikrotik/install-token";
import { syncRouterStats } from "@/lib/mikrotik/router-sync";
import { autoEnablePostInstallAccess } from "@/lib/mikrotik/port-forward";

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

  // Matched by installTokenHash alone, not also status="installing" — the
  // setup page's own polling (checkRouterConnection) calls the same
  // syncRouterStats and can flip status to "online" before this callback
  // fires (the WireGuard tunnel often comes up mid-script, well before the
  // script reaches this call at the very end). Requiring "installing" here
  // made that the common case return 403, leaving installTokenHash set
  // forever and skipping autoEnablePostInstallAccess below. installTokenHash
  // is only ever cleared by this handler, so it alone is enough to reject a
  // genuinely reused/already-completed token.
  const [router] = await db
    .select()
    .from(routers)
    .where(and(eq(routers.orgId, org.id), eq(routers.installTokenHash, hashToken(token))))
    .limit(1);

  if (!router) {
    return new Response("Invalid or completed install token", { status: 403 });
  }
  if (!router.installTokenExpiresAt || router.installTokenExpiresAt < new Date()) {
    return new Response("Install token has expired", { status: 403 });
  }

  // The setup page's polling may have already confirmed the router online
  // by the time this callback fires — re-running syncRouterStats here is
  // still useful (refreshes stats) but its success/failure must not
  // downgrade an already-"online" router back to "installing".
  const result = await syncRouterStats(router.id, {
    timeoutMs: 20000,
    markOfflineOnFailure: false,
  });

  const nowOnline = result.success || router.status === "online";
  await db
    .update(routers)
    .set({
      status: nowOnline ? "online" : "installing",
      installTokenHash: null,
      installTokenExpiresAt: null,
    })
    .where(eq(routers.id, router.id));

  // Auto-open WinBox/WebFig/SSH access through the relay right away, so the
  // router is reachable from the admin's machine the moment install
  // finishes — without this, the tunnel is healthy but unreachable until
  // someone manually visits "Accès distant" and enables each service.
  if (nowOnline) {
    await autoEnablePostInstallAccess(router.id).catch(() => {});
  }

  return new Response("Router installation completed", {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
