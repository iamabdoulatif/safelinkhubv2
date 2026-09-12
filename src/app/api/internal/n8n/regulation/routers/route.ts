import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { routerRegulation, routers } from "@/lib/db/schema";
import { n8nAuthorized, policyOf, unauthorized } from "@/lib/mikrotik/regulation-api";

export const dynamic = "force-dynamic";

/** GET — les routeurs à réguler, avec seuils et dernier état. Une ligne par routeur. */
export async function GET(request: Request) {
  if (!n8nAuthorized(request)) return unauthorized();
  const rows = await getDb()
    .select({ router: routers, regulation: routerRegulation })
    .from(routerRegulation)
    .innerJoin(routers, eq(routers.id, routerRegulation.routerId))
    .where(eq(routerRegulation.enabled, true));

  return Response.json(
    rows.map(({ router, regulation }) => ({
      routerId: router.id,
      name: router.name,
      online: router.status === "online",
      billingCycleDay: router.billingCycleDay ?? 1,
      policy: policyOf(regulation),
      state: regulation.state ?? null,
      watch: regulation.watch ?? {},
    })),
  );
}
