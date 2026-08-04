export type RouterStatusCounts = {
  total: number;
  online: number;
  offline: number;
  configuring: number;
};

export function isConfiguringRouter(status: string): boolean {
  return status === "pending" || status === "installing";
}

export function countRouterStatuses(routers: Array<{ status: string }>): RouterStatusCounts {
  const counts: RouterStatusCounts = {
    total: 0,
    online: 0,
    offline: 0,
    configuring: 0,
  };

  for (const router of routers) {
    counts.total += 1;

    if (router.status === "online") {
      counts.online += 1;
    } else if (isConfiguringRouter(router.status)) {
      counts.configuring += 1;
    } else {
      counts.offline += 1;
    }
  }

  return counts;
}

export type RouterPortfolioScope = "mine" | "clients";

export function parseRouterPortfolioScope(value: string | null | undefined): RouterPortfolioScope {
  return value === "clients" ? "clients" : "mine";
}

export type ClientPortfolio = {
  id: string;
  name: string;
  memberCount: number;
  routerCounts: RouterStatusCounts;
};

type ClientPortfolioInput = {
  ownOrgId: string;
  organizations: Array<{ id: string; name: string }>;
  memberOrgIds: string[];
  routers: Array<{ orgId: string; status: string }>;
};

export function buildClientPortfolios({
  ownOrgId,
  organizations,
  memberOrgIds,
  routers,
}: ClientPortfolioInput): ClientPortfolio[] {
  const organizationIds = new Set(organizations.map((organization) => organization.id));
  const memberCounts = new Map<string, number>();
  const routersByOrganization = new Map<string, Array<{ status: string }>>();

  for (const orgId of memberOrgIds) {
    if (!organizationIds.has(orgId)) continue;
    memberCounts.set(orgId, (memberCounts.get(orgId) ?? 0) + 1);
  }

  for (const router of routers) {
    if (!organizationIds.has(router.orgId)) continue;
    const organizationRouters = routersByOrganization.get(router.orgId) ?? [];
    organizationRouters.push({ status: router.status });
    routersByOrganization.set(router.orgId, organizationRouters);
  }

  return organizations
    .filter((organization) => {
      if (organization.id === ownOrgId) return false;
      return (memberCounts.get(organization.id) ?? 0) > 0 || (routersByOrganization.get(organization.id)?.length ?? 0) > 0;
    })
    .map((organization) => ({
      id: organization.id,
      name: organization.name,
      memberCount: memberCounts.get(organization.id) ?? 0,
      routerCounts: countRouterStatuses(routersByOrganization.get(organization.id) ?? []),
    }))
    .sort((left, right) => left.name.localeCompare(right.name, "fr"));
}
