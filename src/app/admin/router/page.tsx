import { desc, eq } from "drizzle-orm";
import { after } from "next/server";
import { getSession, isSuperAdmin } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { organizations, routers, users } from "@/lib/db/schema";
import { refreshStaleRouters } from "@/lib/mikrotik/router-sync";
import { ClientPortfolioGrid } from "./ClientPortfolioGrid";
import { RouterPortfolioTabs } from "./RouterPortfolioTabs";
import RoutersTable, { type RouterRow } from "./RoutersTable";
import {
  buildClientPortfolios,
  parseRouterPortfolioScope,
  resolveRouterPortfolioView,
} from "./router-portfolio";

type RouterPageProps = {
  searchParams: Promise<{ scope?: string; org?: string }>;
};

type RouterTableSource = Omit<RouterRow, "lastSyncAtMs" | "locked"> & {
  orgId: string;
  lastSyncAt: Date | null;
  portsLockedAt: Date | null;
};

function toRouterRows(rows: RouterTableSource[]): RouterRow[] {
  return rows.map((router) => ({
    id: router.id,
    name: router.name,
    model: router.model,
    host: router.host,
    apiPort: router.apiPort,
    status: router.status,
    cpuLoad: router.cpuLoad,
    memoryUsage: router.memoryUsage,
    activeUsers: router.activeUsers,
    lastSyncAtMs: router.lastSyncAt?.getTime() ?? null,
    connectionMethod: router.connectionMethod,
    locked: Boolean(router.portsLockedAt),
  }));
}

function RouterPageHeader() {
  return (
    <header>
      <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
        Routeurs MikroTik
      </h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-soft">
        Supervisez l’état et la synchronisation de vos parcs MikroTik.
      </p>
    </header>
  );
}

export default async function RouterDashboardPage({ searchParams }: RouterPageProps) {
  const params = await searchParams;
  const session = await getSession();
  const db = getDb();

  if (session) {
    after(() => refreshStaleRouters(session.orgId));
  }

  const superadmin = Boolean(session && isSuperAdmin(session.role));

  if (!session || !superadmin) {
    const ownRouterRows = session
      ? await db
          .select()
          .from(routers)
          .where(eq(routers.orgId, session.orgId))
          .orderBy(desc(routers.createdAt))
      : [];

    return (
      <div className="animate-fade-in-up">
        <RouterPageHeader />
        <div className="mt-8">
          <RoutersTable
            routers={toRouterRows(ownRouterRows)}
            title="Mon parc SafeLinkHub"
            description="Gestion, synchronisation et provisionnement de vos MikroTik."
            headingLevel="h2"
          />
        </div>
      </div>
    );
  }

  const [organizationRows, memberRows, routerRows] = await Promise.all([
    db.select({ id: organizations.id, name: organizations.name }).from(organizations),
    db.select({ orgId: users.orgId }).from(users),
    db
      .select({
        id: routers.id,
        orgId: routers.orgId,
        name: routers.name,
        model: routers.model,
        host: routers.host,
        apiPort: routers.apiPort,
        status: routers.status,
        cpuLoad: routers.cpuLoad,
        memoryUsage: routers.memoryUsage,
        activeUsers: routers.activeUsers,
        lastSyncAt: routers.lastSyncAt,
        connectionMethod: routers.connectionMethod,
        portsLockedAt: routers.portsLockedAt,
      })
      .from(routers)
      .orderBy(desc(routers.createdAt)),
  ]);

  const clients = buildClientPortfolios({
    ownOrgId: session.orgId,
    organizations: organizationRows,
    memberOrgIds: memberRows.map(({ orgId }) => orgId),
    routers: routerRows,
  });
  const scope = parseRouterPortfolioScope(params.scope);
  const view = resolveRouterPortfolioView({
    scope,
    orgId: params.org,
    clients,
  });

  return (
    <div className="animate-fade-in-up">
      <RouterPageHeader />
      <div className="mt-6">
        <RouterPortfolioTabs activeScope={scope} />
      </div>

      <div className="mt-8">
        {view.kind === "own-fleet" ? (
          <RoutersTable
            routers={toRouterRows(routerRows.filter((router) => router.orgId === session.orgId))}
            title="Mon parc SafeLinkHub"
            description="Gestion, synchronisation et provisionnement de vos MikroTik."
            headingLevel="h2"
          />
        ) : view.kind === "client-cards" ? (
          <ClientPortfolioGrid clients={clients} />
        ) : (
          <RoutersTable
            routers={toRouterRows(routerRows.filter((router) => router.orgId === view.client.id))}
            title={`Routeurs de ${view.client.name}`}
            description={`Parc MikroTik de ${view.client.name}.`}
            headingLevel="h2"
            backHref="/admin/router?scope=clients"
            backLabel="Retour aux parcs clients"
            showFleetActions={false}
          />
        )}
      </div>
    </div>
  );
}
