import { and, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { organizations, routers } from "@/lib/db/schema";
import { hashToken } from "@/lib/mikrotik/install-token";
import { syncRouterStats } from "@/lib/mikrotik/router-sync";
import { finalizeRouterReplacement } from "@/lib/mikrotik/router-recovery-service";

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
  // fires. installTokenHash is only ever cleared by this handler, so it alone
  // is enough to reject a genuinely reused/already-completed token.
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

  const replacement = await finalizeRouterReplacement(router.id);
  if (replacement.status === "installing") {
    return new Response("Router connected; replacement finalization pending", {
      status: 202,
      headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" },
    });
  }

  return new Response("Router installation completed", {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
