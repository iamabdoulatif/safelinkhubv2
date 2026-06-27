import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { bridges, routers } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";

/**
 * Plain fetch()-based status check for BootstrapModal's polling loop —
 * deliberately NOT a Server Action. Server Actions are addressed by an id
 * encoded against the exact build that rendered the page; if SafeLinkHub
 * gets redeployed while the modal's 5s poll is still running in an open
 * tab, the next action call references an id the new deployment doesn't
 * recognize, and Next.js's only recovery is a full page reload — which
 * looked like the whole app reloading on its own every time a deploy
 * landed. A route handler has no such build-id coupling: the same URL is
 * served by whichever deployment is currently live, deploy or not.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ bridgeId: string }> },
) {
  const { bridgeId } = await params;
  const session = await getSession();
  if (!session) return Response.json({ error: "Not authenticated." }, { status: 401 });

  const db = getDb();
  const [bridge] = await db
    .select({ id: bridges.id, bootstrapStatus: bridges.bootstrapStatus, routerId: bridges.routerId })
    .from(bridges)
    .where(eq(bridges.id, bridgeId))
    .limit(1);
  if (!bridge) return Response.json({ installed: false });

  const [router] = await db
    .select({ orgId: routers.orgId })
    .from(routers)
    .where(eq(routers.id, bridge.routerId))
    .limit(1);
  if (!router || router.orgId !== session.orgId) return Response.json({ installed: false });

  return Response.json({ installed: bridge.bootstrapStatus === "installed" });
}
