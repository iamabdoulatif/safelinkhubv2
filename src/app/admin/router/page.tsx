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
import { getAdminDict } from "@/lib/i18n/admin";
import { getLocale } from "@/lib/i18n/server";
import type { RouterDictionary } from "./RoutersTable";

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

function RouterPageHeader({ t }: { t: RouterDictionary["page"] }) {
  return (
    <header>
      <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
        {t.title}
      </h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-soft">
        {t.description}
      </p>
    </header>
  );
}

export default async function RouterDashboardPage({ searchParams }: RouterPageProps) {
  const [params, session, locale, dict] = await Promise.all([
    searchParams,
    getSession(),
    getLocale(),
    getAdminDict(),
  ]);
  const t = dict.network.routers;
  const db = getDb();

  const superadmin = Boolean(session && isSuperAdmin(session.role));

  /* Un superadmin voit le parc de TOUTES les organisations : ne rafraîchir que
     la sienne laissait les autres figées sur le dernier passage du cron
     quotidien, dans les deux sens — un routeur revenu restait « hors ligne »,
     un routeur tombé restait « en ligne », jusqu'à 24 h. */
  if (session) {
    after(() => refreshStaleRouters(superadmin ? null : session.orgId));
  }

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
        <RouterPageHeader t={t.page} />
        <div className="mt-8">
          <RoutersTable
            routers={toRouterRows(ownRouterRows)}
            title={t.page.ownFleet}
            description={t.page.fleetDescription}
            headingLevel="h2"
            t={t}
            locale={locale}
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
      <RouterPageHeader t={t.page} />
      <div className="mt-6">
        <RouterPortfolioTabs activeScope={scope} t={t.tabs} />
      </div>

      <div className="mt-8">
        {view.kind === "own-fleet" ? (
          <RoutersTable
            routers={toRouterRows(routerRows.filter((router) => router.orgId === session.orgId))}
            title={t.page.ownFleet}
            description={t.page.fleetDescription}
            headingLevel="h2"
            t={t}
            locale={locale}
          />
        ) : view.kind === "client-cards" ? (
          <ClientPortfolioGrid clients={clients} t={t.clients} />
        ) : (
          <RoutersTable
            routers={toRouterRows(routerRows.filter((router) => router.orgId === view.client.id))}
            title={t.page.clientFleet.replace("{name}", view.client.name)}
            description={t.page.clientFleetDescription.replace("{name}", view.client.name)}
            headingLevel="h2"
            backHref="/admin/router?scope=clients"
            backLabel={t.page.backToClientFleets}
            showFleetActions={false}
            t={t}
            locale={locale}
          />
        )}
      </div>
    </div>
  );
}
