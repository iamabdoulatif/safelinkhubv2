/**
 * Périmètre routeur d'un membre (RBAC par site) — fonction PURE, testable sans
 * base. Les lectures serveur résolvent les sites affectés puis appliquent ce
 * verdict pour filtrer les écrans de parc.
 *
 * Règle : admin/superadmin ne sont JAMAIS restreints. Un membre sans aucun site
 * affecté n'est pas restreint non plus (comportement org-wide préservé). Sinon,
 * il est restreint aux sites listés.
 */
export type RouterScope =
  | { restricted: false }
  | { restricted: true; siteIds: string[] };

export function resolveRouterScope(params: {
  role: string;
  assignedSiteIds: readonly string[];
}): RouterScope {
  if (params.role === "admin" || params.role === "superadmin") {
    return { restricted: false };
  }
  if (params.assignedSiteIds.length === 0) return { restricted: false };
  return { restricted: true, siteIds: [...params.assignedSiteIds] };
}

/**
 * Un routeur (par son site) est-il DANS le périmètre ? Non restreint → toujours
 * vrai. Restreint → seulement si le routeur est rangé dans un site autorisé ;
 * un routeur « non rangé » (siteId null) est volontairement hors périmètre,
 * cohérent avec la clause SQL `scopeRoutersClause`. Utilisé par le point de
 * passage `getRouterForOrg` pour verrouiller l'accès par-id.
 */
export function routerInScope(scope: RouterScope, siteId: string | null): boolean {
  if (!scope.restricted) return true;
  return siteId !== null && scope.siteIds.includes(siteId);
}
