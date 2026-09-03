import { eq, desc } from "drizzle-orm";
import { BarChart2 } from "lucide-react";
import { getDb } from "@/lib/db";
import { routers, vouchers } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import LineChart from "@/components/charts/LineChart";

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

/** Pastille d'état : le point porte l'information, le mot la confirme —
 *  jamais la couleur seule. */
function Etat({ online }: { online: boolean }) {
  return (
    <span className={`flex items-center gap-1.5 text-sm font-medium ${online ? "text-ok" : "text-ink-soft"}`}>
      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${online ? "bg-ok" : "bg-line-soft"}`} />
      {online ? "En ligne" : "Hors ligne"}
    </span>
  );
}

/** Jauge de charge : rouge seulement au-delà de 80 %, là où il y a
 *  effectivement quelque chose à regarder. */
function Jauge({ percent }: { percent: number }) {
  const valeur = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <span className="flex items-center gap-2">
      <span className="h-1.5 w-16 shrink-0 rounded-full bg-clay" aria-hidden="true">
        <span
          className={`block h-full rounded-full ${valeur >= 80 ? "bg-err" : "bg-ink"}`}
          style={{ width: `${valeur}%` }}
        />
      </span>
      <span className="tabular-nums text-xs text-ink-soft">{valeur}%</span>
    </span>
  );
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

  return (
    <div className="mx-auto max-w-5xl animate-fade-in-up">
      <div className="flex items-center gap-2">
        <BarChart2 className="h-5 w-5 text-ink" />
        <h1 className="text-2xl font-bold text-ink">Supervision</h1>
      </div>
      <p className="mt-1 text-sm text-ink-soft">
        Activité réseau en direct et tendance d&apos;activation des tickets.
      </p>

      {/* Quatre cartes de même poids ne disaient pas quoi regarder. Ce qu'on
          vient vérifier ici, c'est le monde en train de se connecter ; le parc
          et les moyennes machines expliquent ce chiffre. */}
      <section className="mt-6 rounded-xl border border-line bg-paper p-5 sm:p-6">
        <p className="text-sm text-ink-soft">Utilisateurs connectés en ce moment</p>
        <p className="mt-1 font-display text-3xl font-extrabold tabular-nums text-ink sm:text-4xl">
          {totalActiveUsers}
        </p>
        <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 border-t border-line-soft pt-4 text-sm">
          <div className="flex items-baseline gap-2">
            <dt className="text-ink-soft">Routeurs en ligne</dt>
            <dd className="font-semibold tabular-nums text-ink">
              {onlineRouters} / {allRouters.length}
            </dd>
          </div>
          <div className="flex items-baseline gap-2">
            <dt className="text-ink-soft">CPU moyen</dt>
            <dd className="font-semibold tabular-nums text-ink">{avgCpu}%</dd>
          </div>
          <div className="flex items-baseline gap-2">
            <dt className="text-ink-soft">Mémoire moyenne</dt>
            <dd className="font-semibold tabular-nums text-ink">{avgMemory}%</dd>
          </div>
        </dl>
      </section>

      <div className="mt-6 border border-line bg-paper p-6 rounded-xl">
        <h2 className="font-semibold text-ink">
          Activations de tickets (14 derniers jours)
        </h2>
        <LineChart
          labels={days.map((d) => d.label)}
          series={[
            {
              key: "activations",
              label: "Activations",
              color: "var(--chart-1)",
              values: days.map((d) => d.count),
            },
          ]}
          ariaLabel="Activations de tickets par jour sur les quatorze derniers jours"
          emptyLabel="Aucune activation sur les quatorze derniers jours."
        />
      </div>

      {allRouters.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-line-soft bg-paper p-10 text-center">
          <p className="font-display text-lg font-bold text-ink">Aucun routeur supervisé</p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-ink-soft">
            Liez un MikroTik depuis Paramètres → Configuration du routeur : sa charge, sa mémoire
            et ses utilisateurs connectés apparaîtront ici.
          </p>
        </div>
      ) : (
      <div className="mt-6 overflow-hidden rounded-xl border border-line bg-paper">
        {/* Cartes sous md : six colonnes de mesures dans un téléphone
            imposaient un défilement latéral, qui séparait la mesure de son
            routeur. */}
        <ul role="list" className="divide-y divide-line-soft md:hidden">
          {allRouters.map((r) => (
            <li key={`m-${r.id}`} className="p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate font-medium text-ink">{r.name}</span>
                <Etat online={r.status === "online"} />
              </div>
              <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs">
                <div className="flex gap-1.5">
                  <dt className="text-ink-soft">Connectés</dt>
                  <dd className="font-semibold tabular-nums text-ink">{r.activeUsers ?? 0}</dd>
                </div>
                <div className="flex gap-1.5">
                  <dt className="text-ink-soft">CPU</dt>
                  <dd className="tabular-nums text-ink">{r.cpuLoad ?? 0}%</dd>
                </div>
                <div className="flex gap-1.5">
                  <dt className="text-ink-soft">Mémoire</dt>
                  <dd className="tabular-nums text-ink">{Math.round(Number(r.memoryUsage ?? 0))}%</dd>
                </div>
                <div className="flex gap-1.5">
                  <dt className="text-ink-soft">Depuis</dt>
                  <dd className="tabular-nums text-ink">{formatUptime(r.uptimeSeconds ?? 0)}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>

        <table className="hidden w-full text-left text-sm md:table">
          <thead className="border-b border-line-soft bg-clay text-ink-soft">
            <tr>
              <th className="px-4 py-3 font-medium">Routeur</th>
              <th className="px-4 py-3 font-medium">Statut</th>
              <th className="px-4 py-3 text-right font-medium">Connectés</th>
              <th className="px-4 py-3 font-medium">CPU</th>
              <th className="px-4 py-3 font-medium">Mémoire</th>
              <th className="px-4 py-3 font-medium">Temps de fonctionnement</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-soft">
            {allRouters.map((r) => (
              <tr key={r.id} className="hover:bg-clay">
                <td className="px-4 py-3 font-medium text-ink">{r.name}</td>
                <td className="px-4 py-3">
                  <Etat online={r.status === "online"} />
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-ink">{r.activeUsers ?? 0}</td>
                {/* Une jauge plutôt qu'un pourcentage nu : sur trente lignes,
                    c'est ce qui laisse repérer la machine qui souffre sans
                    lire chaque nombre. */}
                <td className="px-4 py-3"><Jauge percent={Number(r.cpuLoad ?? 0)} /></td>
                <td className="px-4 py-3"><Jauge percent={Math.round(Number(r.memoryUsage ?? 0))} /></td>
                <td className="whitespace-nowrap px-4 py-3 tabular-nums text-ink-soft">
                  {formatUptime(r.uptimeSeconds ?? 0)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
}
