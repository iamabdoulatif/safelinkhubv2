import Link from "next/link";
import { Router as RouterIcon } from "lucide-react";
import { getSession, isSuperAdmin } from "@/lib/auth/session";
import { getDashboardData, type DailyPoint } from "@/lib/dashboard/queries";
import { getSafecoinReport } from "@/lib/safecoin/queries";
import { formatSc } from "@/lib/safecoin/pricing";
import DateRangePicker from "./DateRangePicker";
import LineChart from "@/components/charts/LineChart";

const fcfa = new Intl.NumberFormat("fr-FR");

function formatFcfa(cents: number) {
  return `FCFA ${fcfa.format(cents)}`;
}

function formatDay(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short" }).format(
    new Date(y, m - 1, d),
  );
}

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function toParam(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function parseDay(value: string | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Revenu brut et dépenses au fil des jours.
 *
 * C'était deux séries de BARRES SUPERPOSÉES — la barre « dépenses », plus
 * étroite, se dessinait par-dessus la barre « revenu ». Quand les deux
 * montants étaient proches, la seconde disparaissait derrière la première, et
 * l'œil devait comparer des hauteurs voisines au lieu de suivre deux
 * tendances. Deux courbes répondent à la vraie question : est-ce que ça monte,
 * et l'écart entre les deux se creuse-t-il.
 *
 * Les dépenses ne portent plus --err : le rouge d'erreur est un statut
 * RÉSERVÉ, pas une couleur de série.
 */
function DailyChart({ daily }: { daily: DailyPoint[] }) {
  return (
    <LineChart
      labels={daily.map((p) => formatDay(p.day))}
      series={[
        {
          key: "gross",
          label: "Revenu brut",
          color: "var(--chart-1)",
          values: daily.map((p) => p.grossCents),
        },
        {
          key: "expense",
          label: "Dépenses",
          color: "var(--chart-2)",
          values: daily.map((p) => p.expenseCents),
        },
      ]}
      unit="fcfa"
      ariaLabel="Revenu brut et dépenses par jour sur la période"
      emptyLabel="Aucun mouvement sur la période sélectionnée."
    />
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const session = await getSession();
  const params = await searchParams;

  const now = new Date();
  const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1);
  let from = parseDay(params.from) ?? defaultFrom;
  let to = parseDay(params.to) ?? now;
  if (from > to) [from, to] = [to, from];
  const toEnd = new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59, 999);

  // Préréglage actif (pour surligner le bon bouton du sélecteur)
  const fromParam = toParam(from);
  const toParamStr = toParam(to);
  const daysAgo = (n: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() - n);
    return toParam(d);
  };
  const activePreset =
    toParamStr !== toParam(now)
      ? null
      : fromParam === toParam(defaultFrom)
        ? "month"
        : fromParam === daysAgo(6)
          ? "7d"
          : fromParam === daysAgo(29)
            ? "30d"
            : null;

  const data = session
    ? await getDashboardData(session.orgId, { from, to: toEnd })
    : null;
  const safecoin = session && isSuperAdmin(session.role)
    ? await getSafecoinReport({ from, to: toEnd })
    : null;

  const rangeLabel = `${new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(from)} – ${new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(to)}`;
  const hasSales = (data?.kpis.salesCount ?? 0) > 0;
  const hasAnyData = hasSales || (data?.kpis.expenseCents ?? 0) > 0;

  const kpiCards = data
    ? [
        {
          label: "Ventes nettes",
          value: formatFcfa(data.kpis.netCents),
          sub: `Brut − commissions − dépenses · ${rangeLabel}`,
        },
        {
          label: "Ventes encaissées",
          value: formatFcfa(data.kpis.grossCents),
          sub: `${data.kpis.salesCount} paiement${data.kpis.salesCount > 1 ? "s" : ""} GeniusPay sur la période`,
        },
        {
          label: "Crédit du compte",
          value: formatFcfa(data.kpis.creditCents),
          sub: "Solde prépayé net",
        },
      ]
    : [];

  return (
    <div className="animate-fade-in-up">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink">Tableau de bord</h1>
        <DateRangePicker from={fromParam} to={toParamStr} activePreset={activePreset} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpiCards.map((k, i) => (
          <div
            key={k.label}
            className={`border-2 border-line bg-paper p-4 hover-lift delay-${(i + 1) * 100}`}
          >
            <p className="text-sm text-ink-soft">{k.label}</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-ink">{k.value}</p>
            <p className="mt-1 text-xs text-ink-soft">{k.sub}</p>
          </div>
        ))}

        {data && data.kpis.routersTotal > 0 ? (
          <Link
            href="/admin/router"
            className="block border-2 border-line bg-paper p-4 hover-lift delay-400"
          >
            <p className="text-sm text-ink-soft">Routeurs</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-ink">
              {data.kpis.routersOnline}/{data.kpis.routersTotal}{" "}
              <span className="text-sm font-normal text-ink-soft">en ligne</span>
            </p>
            <p className="mt-1 text-xs text-ink-soft">
              {data.kpis.activeUsers} utilisateur{data.kpis.activeUsers > 1 ? "s" : ""} actif
              {data.kpis.activeUsers > 1 ? "s" : ""}
            </p>
          </Link>
        ) : (
          <div className="flex flex-col items-center justify-center border-2 border-line bg-paper p-4 text-center hover-lift delay-400">
            <RouterIcon aria-hidden="true" className="h-5 w-5 text-ink-soft" />
            <p className="mt-2 text-sm font-medium text-ink-soft">Aucun routeur lié</p>
            <Link
              href="/admin/settings/router-setup?new=1"
              className="mt-1 text-xs font-bold text-brand-deep hover:underline"
            >
              Lier un MikroTik →
            </Link>
          </div>
        )}
      </div>

      {safecoin && (
        <Link href="/admin/safecoin" className="mt-4 block border-2 border-line bg-[#1c1917] p-5 text-white transition-transform hover:-translate-y-0.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand">Station de contrôle · Safecoin</p>
              <p className="mt-1 text-lg font-semibold">Le cockpit monétaire du mois</p>
            </div>
            <span className="rounded-full border border-white/20 px-3 py-1 text-xs text-white/75">1 SC = {safecoin.rateFcfaPerSc.toLocaleString("fr-FR")} FCFA →</span>
          </div>
          <div className="mt-5 grid gap-3 text-sm sm:grid-cols-3">
            <div className="border border-white/15 px-3 py-2"><p className="text-white/55">SC émis</p><p className="mt-1 text-xl font-bold text-brand">{formatSc(safecoin.kpis.issued)}</p></div>
            <div className="border border-white/15 px-3 py-2"><p className="text-white/55">SC consommés</p><p className="mt-1 text-xl font-bold">{formatSc(safecoin.kpis.spent)}</p></div>
            <div className="border border-white/15 px-3 py-2"><p className="text-white/55">En circulation</p><p className="mt-1 text-xl font-bold">{formatSc(safecoin.kpis.circulating)}</p></div>
          </div>
        </Link>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="border-2 border-line bg-paper p-4 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-semibold text-ink">Aperçu</h2>
              <p className="text-xs text-ink-soft">{rangeLabel}</p>
            </div>
          </div>

          {hasAnyData && data ? (
            <DailyChart daily={data.daily} />
          ) : (
            <div className="mt-4 flex h-48 flex-col items-center justify-center border border-line-soft bg-clay text-center">
              <p className="text-sm font-medium text-ink">Aucune donnée pour cette période</p>
              <p className="mt-1 max-w-xs text-xs text-ink-soft">
                Les paiements encaissés au portail captif et les dépenses apparaîtront
                ici dès la première écriture.
              </p>
            </div>
          )}

          {data && (
            <dl className="mt-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs">
              <div className="flex items-center gap-1.5">
                <span aria-hidden="true" className="h-2 w-2 rounded-full bg-ok" />
                <dt className="text-ink-soft">Revenu net</dt>
                <dd className="font-semibold tabular-nums text-ink">{formatFcfa(data.kpis.netCents)}</dd>
              </div>
              <div className="flex items-center gap-1.5">
                <span aria-hidden="true" className="h-2 w-2 rounded-full bg-ink" />
                <dt className="text-ink-soft">Commission</dt>
                <dd className="font-semibold tabular-nums text-ink">{formatFcfa(data.kpis.commissionCents)}</dd>
              </div>
              <div className="flex items-center gap-1.5">
                <span aria-hidden="true" className="h-2 w-2 rounded-full bg-err" />
                <dt className="text-ink-soft">Dépense</dt>
                <dd className="font-semibold tabular-nums text-ink">{formatFcfa(data.kpis.expenseCents)}</dd>
              </div>
              <div className="flex items-center gap-1.5">
                <span aria-hidden="true" className="h-2 w-2 rounded-full bg-brand" />
                <dt className="text-ink-soft">Revenu brut</dt>
                <dd className="font-semibold tabular-nums text-ink">{formatFcfa(data.kpis.grossCents)}</dd>
              </div>
            </dl>
          )}
        </div>

        <div className="border-2 border-line bg-paper p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold text-ink">Paiements récents</h2>
            {hasSales && (
              <Link href="/admin/sales" className="text-xs font-bold text-brand-deep hover:underline">
                Tout voir →
              </Link>
            )}
          </div>
          {hasSales && data ? (
            <ul className="mt-3 divide-y divide-line-soft" role="list">
              {data.recentSales.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{s.packageName}</p>
                    <p className="truncate font-mono text-xs text-ink-soft">
                      {s.username} · {formatDateTime(s.createdAt)}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-ok">
                    {formatFcfa(s.priceCents)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-6 text-sm text-ink-soft">
              Aucune vente sur cette période.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
