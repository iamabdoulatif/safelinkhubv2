import { eq, desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { organizations, routers, users } from "@/lib/db/schema";
import { getSession, isSuperAdmin } from "@/lib/auth/session";
import { getVpnQuotaStatus } from "@/lib/billing/vpn-quota";
import UsersControlCenter from "./UsersControlCenter";
import { listAllRemoteAccessGrants } from "@/lib/remote-access/grants";
import { countRouterStatuses } from "../router/router-portfolio";
import { resolveFocusedOrganization } from "./organization-focus";

type UsersPageProps = {
  searchParams: Promise<{ org?: string }>;
};

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function quotaLabel(fields: { vpnQuotaMode: string | null; vpnQuotaExpiresAt: Date | null }) {
  const status = getVpnQuotaStatus(fields);
  if (status.unlimited) return "Gratuit illimité";
  if (status.paidOverride) return "VPN payant";
  if (status.free && status.expiresAt) return `Gratuit jusqu'au ${formatDate(status.expiresAt)}`;
  return "Par défaut";
}

function quotaCategory(fields: { vpnQuotaMode: string | null; vpnQuotaExpiresAt: Date | null }) {
  const status = getVpnQuotaStatus(fields);
  if (status.unlimited) return "unlimited" as const;
  if (status.paidOverride) return "paid" as const;
  if (status.free) return "free" as const;
  return "default" as const;
}

export default async function UsersPage({ searchParams }: UsersPageProps) {
  const params = await searchParams;
  const session = await getSession();
  const db = getDb();
  const superadmin = isSuperAdmin(session?.role);
  const availableOrganizations = superadmin
    ? await db
        .select({ id: organizations.id, name: organizations.name, slug: organizations.slug })
        .from(organizations)
        .orderBy(organizations.name)
    : [];
  const focusedOrganization = resolveFocusedOrganization(superadmin, params.org, availableOrganizations);

  const orgUsers = session
    ? superadmin
      ? await db
          .select({
            id: users.id,
            name: users.name,
            email: users.email,
            role: users.role,
            createdAt: users.createdAt,
            orgId: users.orgId,
            orgName: organizations.name,
            vpnQuotaMode: organizations.vpnQuotaMode,
            vpnQuotaExpiresAt: organizations.vpnQuotaExpiresAt,
          })
          .from(users)
          .innerJoin(organizations, eq(users.orgId, organizations.id))
          .where(focusedOrganization ? eq(users.orgId, focusedOrganization.id) : undefined)
          .orderBy(desc(users.createdAt))
      : await db
          .select({
            id: users.id,
            name: users.name,
            email: users.email,
            role: users.role,
            createdAt: users.createdAt,
            orgId: users.orgId,
            orgName: organizations.name,
            vpnQuotaMode: organizations.vpnQuotaMode,
            vpnQuotaExpiresAt: organizations.vpnQuotaExpiresAt,
          })
          .from(users)
          .innerJoin(organizations, eq(users.orgId, organizations.id))
          .where(eq(users.orgId, session.orgId))
          .orderBy(desc(users.createdAt))
    : [];

  const focusedRouters = focusedOrganization
    ? await db
        .select({
          id: routers.id,
          name: routers.name,
          model: routers.model,
          status: routers.status,
          activeUsers: routers.activeUsers,
        })
        .from(routers)
        .where(eq(routers.orgId, focusedOrganization.id))
        .orderBy(routers.name)
    : [];

  const organizationFocus = focusedOrganization
    ? {
        id: focusedOrganization.id,
        name: focusedOrganization.name,
        memberCount: orgUsers.length,
        routerCounts: countRouterStatuses(focusedRouters),
        routers: focusedRouters,
      }
    : null;

  const controlRows = orgUsers.map((user) => {
    const fields = {
      vpnQuotaMode: user.vpnQuotaMode,
      vpnQuotaExpiresAt: user.vpnQuotaExpiresAt,
    };
    const status = getVpnQuotaStatus(fields);
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      orgName: user.orgName,
      role: user.role,
      quotaCategory: quotaCategory(fields),
      quotaLabel: quotaLabel(fields),
      quotaExpiresAt: status.expiresAt?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString(),
    };
  });

  const temporaryAccess = superadmin
    ? {
        organizations: availableOrganizations,
        routers: await db
          .select({ id: routers.id, name: routers.name, orgId: routers.orgId })
          .from(routers)
          .orderBy(routers.name),
        grants: await listAllRemoteAccessGrants(),
      }
    : null;

  return (
    <UsersControlCenter
      rows={controlRows}
      superadmin={superadmin}
      temporaryAccess={temporaryAccess}
      organizationFocus={organizationFocus}
    />
  );
}
