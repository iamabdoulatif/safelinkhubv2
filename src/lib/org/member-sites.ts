// Sites affectés aux membres (RBAC par site) — lectures seules. Le périmètre
// est relu EN BASE à chaque requête : la session est un JWT figé (7 jours), y
// graver les sites laisserait un périmètre périmé jusqu'à reconnexion.
import "server-only";
import { and, eq, inArray, type SQL } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { routers, siteMembers } from "@/lib/db/schema";
import { isSuperAdmin, type SessionPayload } from "@/lib/auth/session";
import { resolveRouterScope, routerInScope, type RouterScope } from "./router-scope";

/** Sites auxquels un membre est restreint (vide = non restreint). */
export async function allowedSiteIdsForUser(
  orgId: string,
  userId: string,
): Promise<string[]> {
  const rows = await getDb()
    .select({ siteId: siteMembers.siteId })
    .from(siteMembers)
    .where(and(eq(siteMembers.orgId, orgId), eq(siteMembers.userId, userId)));
  return rows.map((r) => r.siteId);
}

/** userId → sites affectés, pour l'écran des membres. */
export async function listMemberSiteIds(orgId: string): Promise<Map<string, string[]>> {
  const rows = await getDb()
    .select({ userId: siteMembers.userId, siteId: siteMembers.siteId })
    .from(siteMembers)
    .where(eq(siteMembers.orgId, orgId));
  const map = new Map<string, string[]>();
  for (const r of rows) map.set(r.userId, [...(map.get(r.userId) ?? []), r.siteId]);
  return map;
}

/** Périmètre routeur du titulaire de la session (lecture DB + règle pure). */
export async function routerScopeForSession(session: SessionPayload): Promise<RouterScope> {
  // Court-circuit : un admin n'est jamais restreint, inutile d'interroger la base.
  if (session.role === "admin" || session.role === "superadmin") {
    return { restricted: false };
  }
  const assignedSiteIds = await allowedSiteIdsForUser(session.orgId, session.userId);
  return resolveRouterScope({ role: session.role, assignedSiteIds });
}

/**
 * Clause SQL à AJOUTER (via `and(...)`) au filtre org des listes de parc pour
 * respecter le périmètre du membre. `undefined` = pas de restriction. Les
 * routeurs « non rangés » (site_id null) sont volontairement exclus pour un
 * membre restreint : ils n'appartiennent à aucun de ses sites.
 */
export async function scopeRoutersClause(
  session: SessionPayload,
): Promise<SQL | undefined> {
  const scope = await routerScopeForSession(session);
  if (!scope.restricted) return undefined;
  return inArray(routers.siteId, scope.siteIds);
}

/**
 * POINT DE PASSAGE pour tout accès à UN routeur par son id. Renvoie la ligne
 * complète si l'appelant y a droit, sinon `null` (l'appelant fait notFound/404).
 * Règle : superadmin → n'importe quelle org ; sinon le routeur doit appartenir
 * à l'org de la session ET être dans le périmètre de sites du membre. Un seul
 * endroit à auditer pour le verrouillage par-id (fiche, API mobile…).
 */
export async function getRouterForOrg(
  routerId: string,
  session: SessionPayload,
): Promise<typeof routers.$inferSelect | null> {
  const [router] = await getDb()
    .select()
    .from(routers)
    .where(eq(routers.id, routerId))
    .limit(1);
  if (!router) return null;
  if (isSuperAdmin(session.role)) return router;
  if (router.orgId !== session.orgId) return null;
  const scope = await routerScopeForSession(session);
  return routerInScope(scope, router.siteId) ? router : null;
}
