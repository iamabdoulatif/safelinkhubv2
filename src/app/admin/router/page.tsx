import { eq, desc } from "drizzle-orm";
import { after } from "next/server";
import { getDb } from "@/lib/db";
import { routers, organizations } from "@/lib/db/schema";
import { getSession, isSuperAdmin } from "@/lib/auth/session";
import RoutersTable from "./RoutersTable";
import { refreshStaleRouters } from "@/lib/mikrotik/router-sync";

export default async function RouterDashboardPage() {
  const session = await getSession();
  const db = getDb();

  if (session) {
    after(() => refreshStaleRouters(session.orgId));
  }

  // Le superadmin (opérateur de la plateforme) voit TOUS les routeurs, tous
  // clients confondus, avec le nom de l'organisation — pour pouvoir mener des
  // actions sur n'importe lequel. Un admin normal reste limité à son org.
  const superadmin = Boolean(session && isSuperAdmin(session.role));

  const rows = !session
    ? []
    : superadmin
      ? await db
          .select({ router: routers, orgName: organizations.name })
          .from(routers)
          .leftJoin(organizations, eq(routers.orgId, organizations.id))
          .orderBy(desc(routers.createdAt))
      : (
          await db
            .select()
            .from(routers)
            .where(eq(routers.orgId, session.orgId))
            .orderBy(desc(routers.createdAt))
        ).map((r) => ({ router: r, orgName: null as string | null }));

  return (
    <div className="animate-fade-in-up">
      <RoutersTable
        routers={rows.map(({ router: r, orgName }) => ({
          id: r.id,
          name: r.name,
          model: r.model,
          host: r.host,
          apiPort: r.apiPort,
          status: r.status,
          cpuLoad: r.cpuLoad,
          memoryUsage: r.memoryUsage,
          activeUsers: r.activeUsers,
          lastSyncAtMs: r.lastSyncAt?.getTime() ?? null,
          connectionMethod: r.connectionMethod,
          orgName,
          locked: Boolean(r.portsLockedAt),
        }))}
      />
    </div>
  );
}
