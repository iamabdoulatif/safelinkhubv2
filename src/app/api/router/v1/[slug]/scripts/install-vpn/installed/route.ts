import { and, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { organizations, routers } from "@/lib/db/schema";
import { hashToken } from "@/lib/mikrotik/install-token";
import { syncRouterStats } from "@/lib/mikrotik/router-sync";

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

  const [router] = await db
    .select()
    .from(routers)
    .where(
      and(
        eq(routers.orgId, org.id),
        eq(routers.installTokenHash, hashToken(token)),
        eq(routers.status, "installing"),
      ),
    )
    .limit(1);

  if (!router) {
    return new Response("Invalid or completed install token", { status: 403 });
  }
  if (!router.installTokenExpiresAt || router.installTokenExpiresAt < new Date()) {
    return new Response("Install token has expired", { status: 403 });
  }

  // Don't mark the router "online" until we've actually reached it through
  // the freshly-installed tunnel. The WireGuard handshake / route on the
  // router side can take a few seconds after the script runs, so a failed
  // check here just leaves the router "installing" — the setup page keeps
  // polling checkRouterConnection until syncRouterStats succeeds.
  const result = await syncRouterStats(router.id, {
    timeoutMs: 20000,
    markOfflineOnFailure: false,
  });

  await db
    .update(routers)
    .set({
      status: result.success ? "online" : "installing",
      installTokenHash: null,
      installTokenExpiresAt: null,
    })
    .where(eq(routers.id, router.id));

  return new Response("Router installation completed", {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
