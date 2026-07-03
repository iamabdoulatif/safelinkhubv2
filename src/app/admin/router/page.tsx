import { eq, desc } from "drizzle-orm";
import { after } from "next/server";
import { getDb } from "@/lib/db";
import { routers } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import RoutersTable from "./RoutersTable";
import { refreshStaleRouters } from "@/lib/mikrotik/router-sync";

export default async function RouterDashboardPage() {
  const session = await getSession();
  const db = getDb();

  if (session) {
    after(() => refreshStaleRouters(session.orgId));
  }

  const allRouters = session
    ? await db
        .select()
        .from(routers)
        .where(eq(routers.orgId, session.orgId))
        .orderBy(desc(routers.createdAt))
    : [];

  return (
    <div className="animate-fade-in-up">
      <RoutersTable
        routers={allRouters.map((r) => ({
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
        }))}
      />
    </div>
  );
}
