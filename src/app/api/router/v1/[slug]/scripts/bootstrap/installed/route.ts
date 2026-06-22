import { and, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { bridges, organizations, routers } from "@/lib/db/schema";
import { hashToken } from "@/lib/mikrotik/install-token";

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
            eq(bridges.bootstrapTokenHash, hashToken(token)),
            eq(bridges.bootstrapStatus, "pending"),
          ),
        )
        .limit(1)
    : [];

  if (!bridge || !routerIds.includes(bridge.routerId)) {
    return new Response("Invalid or completed bootstrap token", { status: 403 });
  }
  if (!bridge.bootstrapTokenExpiresAt || bridge.bootstrapTokenExpiresAt < new Date()) {
    return new Response("Bootstrap token has expired", { status: 403 });
  }

  await db
    .update(bridges)
    .set({
      bootstrapStatus: "installed",
      bootstrapTokenHash: null,
      bootstrapTokenExpiresAt: null,
    })
    .where(eq(bridges.id, bridge.id));

  return new Response("Bootstrap completed", {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
