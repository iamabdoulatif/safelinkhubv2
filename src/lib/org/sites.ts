// Sites (agences/succursales) d'une organisation et routeurs rattachés —
// lectures seules, hors d'un fichier "use server" (même convention que
// members.ts). Toujours filtrer par l'orgId PASSÉ : aucun id ne vient du
// formulaire ici.
import "server-only";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { routers, sites } from "@/lib/db/schema";

// Périmètre optionnel : un membre restreint (RBAC par site) ne voit que ces
// sites. `undefined` = non restreint (tous les sites de l'org).
export type SiteScope = { siteIds?: string[] };

export type Site = {
  id: string;
  name: string;
  code: string;
  active: boolean;
  routerCount: number;
  createdAt: Date;
};

/** Sites de l'org, chacun avec son nombre de routeurs rattachés. */
export async function listSites(orgId: string, scope?: SiteScope): Promise<Site[]> {
  return getDb()
    .select({
      id: sites.id,
      name: sites.name,
      code: sites.code,
      active: sites.active,
      // count(router_id) et non count(*) : le left join rend une ligne même
      // pour un site vide, où router_id est NULL → compté 0.
      routerCount: sql<number>`count(${routers.id})::int`,
      createdAt: sites.createdAt,
    })
    .from(sites)
    .leftJoin(routers, eq(routers.siteId, sites.id))
    .where(
      and(
        eq(sites.orgId, orgId),
        scope?.siteIds ? inArray(sites.id, scope.siteIds) : undefined,
      ),
    )
    .groupBy(sites.id)
    .orderBy(desc(sites.createdAt));
}

/** Un site de l'org, re-scopé. null si l'id ne lui appartient pas. */
export async function getSite(orgId: string, siteId: string) {
  const [row] = await getDb()
    .select()
    .from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.orgId, orgId)))
    .limit(1);
  return row ?? null;
}

export type SiteRouter = { id: string; name: string; status: string };

/** Routeurs rattachés à un site (re-scopé org). */
export async function listRoutersForSite(
  orgId: string,
  siteId: string,
): Promise<SiteRouter[]> {
  return getDb()
    .select({ id: routers.id, name: routers.name, status: routers.status })
    .from(routers)
    .where(and(eq(routers.orgId, orgId), eq(routers.siteId, siteId)))
    .orderBy(asc(routers.name));
}

/** Routeurs de l'org non encore rangés dans un site — pour l'affectation. */
export async function listUnassignedRouters(orgId: string): Promise<SiteRouter[]> {
  return getDb()
    .select({ id: routers.id, name: routers.name, status: routers.status })
    .from(routers)
    .where(and(eq(routers.orgId, orgId), isNull(routers.siteId)))
    .orderBy(asc(routers.name));
}

export type AssignableRouter = SiteRouter & { siteId: string | null };

/** Tous les routeurs de l'org avec leur site actuel — alimente le tableau
 *  d'affectation (un select par routeur). Un membre restreint ne voit que les
 *  routeurs de ses sites (les « non rangés » lui sont volontairement masqués). */
export async function listOrgRoutersWithSite(
  orgId: string,
  scope?: SiteScope,
): Promise<AssignableRouter[]> {
  return getDb()
    .select({
      id: routers.id,
      name: routers.name,
      status: routers.status,
      siteId: routers.siteId,
    })
    .from(routers)
    .where(
      and(
        eq(routers.orgId, orgId),
        scope?.siteIds ? inArray(routers.siteId, scope.siteIds) : undefined,
      ),
    )
    .orderBy(asc(routers.name));
}
