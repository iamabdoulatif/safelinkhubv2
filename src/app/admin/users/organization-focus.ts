import type { RouterStatusCounts } from "../router/router-portfolio";

type Organization = {
  id: string;
  name: string;
};

export type OrganizationFocus = {
  id: string;
  name: string;
  memberCount: number;
  routerCounts: RouterStatusCounts;
  routers: Array<{
    id: string;
    name: string;
    model: string | null;
    status: string;
    activeUsers: number | null;
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
