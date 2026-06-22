import { eq, desc } from "drizzle-orm";
import { after } from "next/server";
import { Router } from "lucide-react";
import { getDb } from "@/lib/db";
import { routers } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import RefreshButton from "./RefreshButton";
import RoutersTable from "./RoutersTable";
import { refreshStaleRouters } from "@/lib/mikrotik/router-sync";

function formatUptime(seconds: number) {
  if (seconds <= 0) return "0m";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  return parts.join(" ");
}

function timeAgo(date: Date | null) {
  if (!date) return "jamais";
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "à l'instant";
  if (seconds < 3600) return `il y a ${Math.floor(seconds / 60)} minutes`;
  return `il y a ${Math.floor(seconds / 3600)} heures`;
}

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

  const router = allRouters[0];

  if (!router) {
    return <RoutersTable routers={[]} />;
  }

  const stats = [
    { label: "Temps de fonctionnement", value: formatUptime(router.uptimeSeconds ?? 0) },
    { label: "Utilisateurs actifs", value: String(router.activeUsers ?? 0) },
    { label: "Charge CPU", value: `${router.cpuLoad ?? 0}%` },
    { label: "Utilisation mémoire", value: `${router.memoryUsage ?? 0}%` },
  ];

  return (
    <div>
      <RoutersTable
        routers={allRouters.map((r) => ({
          id: r.id,
          name: r.name,
          model: r.model,
          status: r.status,
          cpuLoad: r.cpuLoad,
          memoryUsage: r.memoryUsage,
          connectionMethod: r.connectionMethod,
        }))}
      />

      <div className="mt-10 flex items-center justify-between border-t border-slate-100 pt-8">
        <div className="flex items-center gap-2">
          <Router className="h-5 w-5 text-slate-700" />
          <h2 className="text-xl font-bold text-slate-900">
            Détails — {router.name}
          </h2>
        </div>
        <RefreshButton routerId={router.id} />
      </div>

      <div className="mt-1 flex items-center gap-4 text-sm text-slate-500">
        <span
          className={`flex items-center gap-1.5 ${
            router.status === "online" ? "text-emerald-600" : "text-red-500"
          }`}
        >
          <span
            className={`h-2 w-2 rounded-full ${
              router.status === "online" ? "bg-emerald-500" : "bg-red-500"
            }`}
          />
          {router.status === "online" ? "En ligne" : "Hors ligne"}
        </span>
        <span>Dernière synchro : {timeAgo(router.lastSyncAt)}</span>
      </div>
      <p className="mt-1 text-sm text-slate-400">
        Routeur : {router.model} ({router.host})
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-slate-200 bg-white p-4"
          >
            <p className="text-sm text-slate-500">{s.label}</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">
              {s.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
