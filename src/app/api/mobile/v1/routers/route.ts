import { asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { routers } from "@/lib/db/schema";
import { requireMobileSession } from "@/lib/mobile/http";
import { ROUTER_FIELDS } from "@/lib/mobile/routers";


/** GET /api/mobile/v1/routers — les routeurs de l'organisation, triés par nom. */
export async function GET() {
  const auth = await requireMobileSession();
  if ("response" in auth) return auth.response;

  const rows = await getDb()
    .select(ROUTER_FIELDS)
    .from(routers)
    .where(eq(routers.orgId, auth.session.orgId))
    .orderBy(asc(routers.name));

  return Response.json({
    routers: rows.map((r) => ({ ...r, memoryUsage: r.memoryUsage === null ? null : Number(r.memoryUsage) })),
  });
}
