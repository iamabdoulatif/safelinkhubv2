import { desc, eq } from "drizzle-orm";
import { after } from "next/server";
import { getSession, isSuperAdmin } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { organizations, routers, users } from "@/lib/db/schema";
import { refreshStaleRouters } from "@/lib/mikrotik/router-sync";
import { ClientPortfolioBrowser } from "./ClientPortfolioBrowser";
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
import { routerLocationLabel } from "@/lib/geo/router-location";

type RouterPageProps = {
  searchParams: Promise<{ scope?: string; org?: string }>;
};

type RouterTableSource = Omit<RouterRow, "lastSyncAtMs" | "locked" | "location"> & {
  orgId: string;
  lastSyncAt: Date | null;
  portsLockedAt: Date | null;
  locationStreet: string | null;
  locationNeighbourhood: string | null;
  locationCommune: string | null;
  locationCountry: string | null;
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
    // Composé ici, une fois : la table l'affiche ET le cherche.
    location: routerLocationLabel(router),
  }));
}

function RouterPageHeader({ t }: { t: RouterDictionary["page"] }) {
  return (
    /* Un seul titre monumental par écran — et pas celui-ci : la question de
       l'exploitant n'est pas « où suis-je », c'est « est-ce que mon parc va
       bien ». Le titre se range, l'état du parc prend la place. */
    <header>
      <h1 className="font-display text-lg font-semibold tracking-tight text-ink sm:text-xl">
        {t.title}
      </h1>
      <p className="mt-1 max-w-2xl text-sm leading-6 text-ink-soft">{t.description}</p>
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
        <div className="mt-5">
          <RoutersTable
            routers={toRouterRows(ownRouterRows)}
            title={t.page.ownFleet}
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
        locationStreet: routers.locationStreet,
        locationNeighbourhood: routers.locationNeighbourhood,
        locationCommune: routers.locationCommune,
        locationCountry: routers.locationCountry,
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
      <div className="mt-4">
        <RouterPortfolioTabs activeScope={scope} t={t.tabs} />
      </div>

      <div className="mt-5">
        {view.kind === "own-fleet" ? (
          <RoutersTable
            routers={toRouterRows(routerRows.filter((router) => router.orgId === session.orgId))}
            title={t.page.ownFleet}
            headingLevel="h2"
            canLock={superadmin}
            t={t}
            locale={locale}
          />
        ) : view.kind === "client-cards" ? (
          <ClientPortfolioBrowser clients={clients} t={t.clients} />
        ) : (
          <RoutersTable
            routers={toRouterRows(routerRows.filter((router) => router.orgId === view.client.id))}
            title={t.page.clientFleet.replace("{name}", view.client.name)}
            description={t.page.clientFleetDescription.replace("{name}", view.client.name)}
            headingLevel="h2"
            backHref="/admin/router?scope=clients"
            backLabel={t.page.backToClientFleets}
            showFleetActions={false}
            canLock={superadmin}
            t={t}
            locale={locale}
          />
        )}
      </div>
    </div>
  );
}
