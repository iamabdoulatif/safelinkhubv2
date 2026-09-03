import type { RouterStatusCounts } from "../router/router-portfolio";

type Organization = {
  id: string;
  name: string;
};

export type OrganizationFocus = {
  id: string;
  name: string;
  routerTableHref: string | null;
  memberCount: number;
  routerCounts: RouterStatusCounts;
  routers: Array<{
    id: string;
    name: string;
    model: string | null;
    status: string;
    activeUsers: number | null;
    /** Ports actuellement coupés (kill-switch superadmin) ? */
    locked: boolean;
  }>;
};

export function resolveFocusedOrganization<T extends Organization>(
  isSuperadmin: boolean,
  requestedOrgId: string | null | undefined,
  organizations: T[],
): T | null {
  if (!isSuperadmin || !requestedOrgId) return null;

  return organizations.find((organization) => organization.id === requestedOrgId) ?? null;
}

export function resolveOrganizationFocusQuery<T extends Organization>(
  isSuperadmin: boolean,
  requestedOrgId: string | null | undefined,
  organizations: T[],
): { organization: T | null; userOrgId: string | null } {
  const organization = resolveFocusedOrganization(isSuperadmin, requestedOrgId, organizations);

  return {
    organization,
    userOrgId: organization?.id ?? null,
  };
}

export function resolveFocusedRouterTableHref({
  organization,
  ownOrganizationId,
  memberCount,
  routerCount,
}: {
  organization: Organization | null;
  ownOrganizationId: string | null | undefined;
  memberCount: number;
  routerCount: number;
}): string | null {
  if (!organization) return null;
  if (organization.id === ownOrganizationId) return "/admin/router?scope=mine";
  if (memberCount === 0 && routerCount === 0) return null;

  return `/admin/router?scope=clients&org=${organization.id}`;
}
