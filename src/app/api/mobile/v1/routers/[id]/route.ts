import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { routers } from "@/lib/db/schema";
import { apiError, requireMobileSession } from "@/lib/mobile/http";
import { ROUTER_FIELDS } from "@/lib/mobile/routers";
import { scopeRoutersClause } from "@/lib/org/member-sites";

/** GET /api/mobile/v1/routers/:id — un routeur de l'organisation (404 sinon). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireMobileSession();
  if ("response" in auth) return auth.response;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return apiError(404, "not_found", "Routeur introuvable.");

  const [router] = await getDb()
    .select(ROUTER_FIELDS)
    .from(routers)
    // Scopé à l'organisation de l'appelant ET à son périmètre de sites (RBAC par
    // site) : l'id d'un autre compte ou d'une agence non autorisée renvoie 404.
    .where(
      and(
        eq(routers.id, id),
        eq(routers.orgId, auth.session.orgId),
        await scopeRoutersClause(auth.session),
      ),
    )
    .limit(1);
  if (!router) return apiError(404, "not_found", "Routeur introuvable.");

  return Response.json({
    router: { ...router, memoryUsage: router.memoryUsage === null ? null : Number(router.memoryUsage) },
  });
}
