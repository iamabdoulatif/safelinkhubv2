import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { routerRegulation, routers } from "@/lib/db/schema";

/**
 * Contrat interne n8n ↔ plateforme (voir docs/n8n/regulation.md). Jeton dédié
 * — pas CRON_SECRET : n8n est un service tiers, sa clé se révoque à part.
 */
export function n8nAuthorized(request: Request): boolean {
  const token = process.env.N8N_INTERNAL_TOKEN;
  return Boolean(token) && request.headers.get("authorization") === `Bearer ${token}`;
}

export const unauthorized = () => Response.json({ error: "Unauthorized" }, { status: 401 });

/** Routeur + sa politique de régulation, ou null si absente / non éligible. */
export async function loadRegulatedRouter(routerId: string) {
  const [row] = await getDb()
    .select({ router: routers, regulation: routerRegulation })
    .from(routerRegulation)
    .innerJoin(routers, eq(routers.id, routerRegulation.routerId))
    .where(eq(routerRegulation.routerId, routerId))
    .limit(1);
  return row ?? null;
}

export function policyOf(r: typeof routerRegulation.$inferSelect) {
  return {
    softCapMb: r.softCapMb,
    hardCapMb: r.hardCapMb,
    safety: Number(r.safety),
    dayCriticalRatio: Number(r.dayCriticalRatio),
    blockLimit: r.blockLimit,
    abuseThresholdMb: r.abuseThresholdMb,
    abuseBlockMinutes: r.abuseBlockMinutes,
    abuseMaxOffenses: r.abuseMaxOffenses,
  };
}
