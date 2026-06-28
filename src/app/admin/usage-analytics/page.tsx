import { eq, desc } from "drizzle-orm";
import { BarChart2 } from "lucide-react";
import { getDb } from "@/lib/db";
import { routers, vouchers } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";

function formatUptime(seconds: number) {
  if (seconds <= 0) return "0m";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const parts = [];
  if (days) parts.push(`${days}j`);
  if (hours) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  return parts.join(" ");
}

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export default async function UsageAnalyticsPage() {
  const session = await getSession();
  const db = getDb();

  const allRouters = session
    ? await db
        .select()
        .from(routers)
        .where(eq(routers.orgId, session.orgId))
        .orderBy(desc(routers.createdAt))
    : [];

  const allVouchers = session
    ? await db
        .select({
          firstLoginAt: vouchers.firstLoginAt,
          createdAt: vouchers.createdAt,
        })
        .from(vouchers)
        .where(eq(vouchers.orgId, session.orgId))
    : [];

  const totalActiveUsers = allRouters.reduce(
    (sum, r) => sum + (r.activeUsers ?? 0),
    0,
  );
  const onlineRouters = allRouters.filter((r) => r.status === "online").length;
  const avgCpu = allRouters.length
    ? Math.round(
        allRouters.reduce((sum, r) => sum + (r.cpuLoad ?? 0), 0) /
          allRouters.length,
      )
    : 0;
  const avgMemory = allRouters.length
    ? Math.round(
        allRouters.reduce((sum, r) => sum + Number(r.memoryUsage ?? 0), 0) /
          allRouters.length,
      )
    : 0;

  // Activations (premier login) sur les 14 derniers jours
  const days: { key: string; label: string; count: number }[] = [];
  const now = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    days.push({
      key: dayKey(d),
      label: d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }),
      count: 0,
    });
  }
  const countByDay = new Map(days.map((d) => [d.key, d]));
  for (const v of allVouchers) {
    if (!v.firstLoginAt) continue;
    const key = dayKey(v.firstLoginAt);
    const bucket = countByDay.get(key);
    if (bucket) bucket.count += 1;
  }
  const maxCount = Math.max(1, ...days.map((d) => d.count));

  return (
    <div className="mx-auto max-w-5xl animate-fade-in-up">
      <div className="flex items-center gap-2">
        <BarChart2 className="h-5 w-5 text-slate-700" />
        <h1 className="text-2xl font-bold text-slate-900">
          Analyse d&apos;utilisation
        </h1>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Activité réseau en direct et tendance d&apos;activation des vouchers.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 hover-lift">
          <p className="text-sm text-slate-500">Utilisateurs actifs</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">
            {totalActiveUsers}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 hover-lift">
          <p className="text-sm text-slate-500">Routeurs en ligne</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">
            {onlineRouters} / {allRouters.length}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 hover-lift">
          <p className="text-sm text-slate-500">Charge CPU moyenne</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{avgCpu}%</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 hover-lift">
          <p className="text-sm text-slate-500">Mémoire moyenne</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">
            {avgMemory}%
          </p>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="font-semibold text-slate-900">
          Activations de vouchers (14 derniers jours)
        </h2>
        <div className="mt-4 flex items-end gap-1.5" style={{ height: 140 }}>
          {days.map((d) => (
            <div key={d.key} className="flex flex-1 flex-col items-center gap-1">
              <div
                className="w-full rounded-t bg-emerald-500/80"
                style={{ height: `${Math.max(4, (d.count / maxCount) * 120)}px` }}
                title={`${d.count} activation(s)`}
              />
              <span className="text-[10px] text-slate-400">{d.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="table-mobile-wrapper">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Routeur</th>
              <th className="px-4 py-3 font-medium">Statut</th>
              <th className="px-4 py-3 font-medium">Utilisateurs actifs</th>
              <th className="px-4 py-3 font-medium">CPU</th>
              <th className="px-4 py-3 font-medium">Mémoire</th>
              <th className="px-4 py-3 font-medium">Temps de fonctionnement</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {allRouters.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  Aucun routeur pour le moment.
                </td>
              </tr>
            )}
            {allRouters.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3 font-medium text-slate-900">{r.name}</td>
                <td className="px-4 py-3">
                  <span
                    className={`flex items-center gap-1.5 text-sm font-medium ${
                      r.status === "online" ? "text-emerald-600" : "text-slate-500"
                    }`}
                  >
                    <span
                      className={`h-2 w-2 rounded-full ${
                        r.status === "online" ? "bg-emerald-500" : "bg-slate-300"
                      }`}
                    />
                    {r.status === "online" ? "En ligne" : "Hors ligne"}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-600">{r.activeUsers ?? 0}</td>
                <td className="px-4 py-3 text-slate-600">{r.cpuLoad ?? 0}%</td>
                <td className="px-4 py-3 text-slate-600">
                  {r.memoryUsage ?? 0}%
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {formatUptime(r.uptimeSeconds ?? 0)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
