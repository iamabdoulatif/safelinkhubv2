import Link from "next/link";
import { AlertTriangle, ArrowUpRight, Router as RouterIcon, Ticket, Wifi } from "lucide-react";
import { type DailyPoint } from "@/lib/dashboard/queries";
import { formatSc } from "@/lib/safecoin/pricing";
import DateRangePicker from "./DateRangePicker";
import LineChart from "@/components/charts/LineChart";

/* Présentation du tableau de bord, SANS accès à la base ni à la session.
 *
 * Séparée de page.tsx pour une raison concrète : /admin exige une session, donc
 * l'écran ne peut pas être ouvert pour vérification visuelle sans se connecter.
 * Avec les données en props, un banc d'essai local peut le rendre tel quel avec
 * des valeurs simulées — c'est le VRAI composant qui est inspecté, pas une
 * copie de son balisage qui divergerait au premier changement. */

export type DashboardKpis = {
  grossCents: number;
  commissionCents: number;
  expenseCents: number;
  netCents: number;
  creditCents: number;
  salesCount: number;
  routersTotal: number;
  routersOnline: number;
  routersOffline: string[];
  activeUsers: number;
};

export type DashboardSale = {
  id: string;
  packageName: string;
  username: string;
  priceCents: number;
  createdAt: Date;
};

export type SafecoinSummary = {
  rateFcfaPerSc: number;
  kpis: { issued: number; spent: number; circulating: number };
};

export type DashboardViewProps = {
  kpis: DashboardKpis | null;
  daily: DailyPoint[];
  recentSales: DashboardSale[];
  safecoin: SafecoinSummary | null;
  rangeLabel: string;
  picker: { from: string; to: string; activePreset: string | null };
};

const fcfa = new Intl.NumberFormat("fr-FR");

function formatFcfa(cents: number) {
  return `${fcfa.format(cents)} FCFA`;
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

const SERIES = [
  { key: "gross", label: "Revenu brut", color: "var(--chart-1)" },
  { key: "expense", label: "Dépenses", color: "var(--chart-2)" },
] as const;

function DailyChart({ daily }: { daily: DailyPoint[] }) {
  return (
    <LineChart
      labels={daily.map((p) => formatDay(p.day))}
      series={SERIES.map((s) => ({
        key: s.key,
        label: s.label,
        color: s.color,
        values: daily.map((p) => (s.key === "gross" ? p.grossCents : p.expenseCents)),
      }))}
      unit="fcfa"
      ariaLabel="Revenu brut et dépenses par jour sur la période"
      emptyLabel="Aucun mouvement sur la période sélectionnée."
    />
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-line bg-paper ${className}`}>{children}</div>;
}

export default function DashboardView({ kpis, daily, recentSales, safecoin, rangeLabel, picker }: DashboardViewProps) {
  const data = kpis ? { kpis, daily, recentSales } : null;
  const hasSales = (kpis?.salesCount ?? 0) > 0;
  const hasAnyData = hasSales || (kpis?.expenseCents ?? 0) > 0;
  const offline = kpis?.routersOffline ?? [];
  const total = kpis?.routersTotal ?? 0;
  const online = kpis?.routersOnline ?? 0;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink">Tableau de bord</h1>
        <DateRangePicker from={picker.from} to={picker.to} activePreset={picker.activePreset} />
      </div>

      {/* Ce qui exige une action passe AVANT les chiffres. L'écran précédent
          affichait « 11/14 en ligne » noyé dans une carte parmi quatre, sans
          jamais nommer les routeurs tombés ni proposer d'y aller. */}
      {offline.length > 0 && (
        <Link
          href="/admin/router?status=offline"
          className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-err bg-err-soft px-4 py-3.5 transition-colors hover:bg-err-soft/70"
        >
          <AlertTriangle aria-hidden="true" className="h-5 w-5 shrink-0 text-err" />
          <p className="text-sm font-semibold text-err">
            {offline.length} routeur{offline.length > 1 ? "s" : ""} hors ligne
          </p>
          <p className="min-w-0 flex-1 truncate font-mono text-xs text-ink-soft">
            {offline.join(" · ")}
          </p>
          <span className="text-xs font-semibold text-err">Diagnostiquer →</span>
        </Link>
      )}

      {/* Un chiffre domine, les autres le qualifient. */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
            Encaissé · {rangeLabel}
          </p>
          <p className="mt-2 text-4xl font-bold tabular-nums tracking-tight text-ink sm:text-5xl">
            {formatFcfa(data?.kpis.grossCents ?? 0)}
          </p>
          <p className="mt-2 text-sm text-ink-soft">
            <span className="font-semibold text-ink">{formatFcfa(data?.kpis.netCents ?? 0)}</span>{" "}
            nets après commissions et dépenses ·{" "}
            {data?.kpis.salesCount ?? 0} paiement{(data?.kpis.salesCount ?? 0) > 1 ? "s" : ""}
          </p>

          <div className="mt-6 flex flex-wrap gap-2">
            <Link
              href="/admin/vouchers"
              className="inline-flex items-center gap-2 rounded-full border border-line bg-brand px-4 py-2 text-sm font-bold text-slate-deep hover:bg-ink hover:text-paper"
            >
              <Ticket aria-hidden="true" className="h-4 w-4" />
              Générer des vouchers
            </Link>
            <Link
              href="/admin/sales"
              className="inline-flex items-center gap-2 rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink hover:bg-clay"
            >
              Voir les ventes
              <ArrowUpRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          </div>
        </Card>

        <Card className="flex flex-col p-6">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">Parc</p>
          {total > 0 ? (
            <>
              <p className="mt-2 text-3xl font-bold tabular-nums text-ink">
                {online}
                <span className="text-lg font-medium text-ink-soft"> / {total} en ligne</span>
              </p>
              <div className="mt-4 flex gap-1" aria-hidden="true">
                {Array.from({ length: total }).map((_, i) => (
                  <span
                    key={i}
                    className={`h-1.5 flex-1 rounded-full ${i < online ? "bg-ok" : "bg-err"}`}
                  />
                ))}
              </div>
              <p className="mt-4 flex items-center gap-2 text-sm text-ink-soft">
                <Wifi aria-hidden="true" className="h-4 w-4" />
                <span className="font-semibold tabular-nums text-ink">
                  {data?.kpis.activeUsers ?? 0}
                </span>
                session{(data?.kpis.activeUsers ?? 0) > 1 ? "s" : ""} active
                {(data?.kpis.activeUsers ?? 0) > 1 ? "s" : ""}
              </p>
              <Link
                href="/admin/router"
                className="mt-auto pt-4 text-sm font-semibold text-brand-deep hover:underline"
              >
                Voir le parc →
              </Link>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center py-4 text-center">
              <RouterIcon aria-hidden="true" className="h-6 w-6 text-ink-soft" />
              <p className="mt-2 text-sm font-medium text-ink">Aucun routeur lié</p>
              <Link
                href="/admin/settings/router-setup?new=1"
                className="mt-3 inline-flex items-center gap-2 rounded-full border border-line bg-brand px-4 py-2 text-sm font-bold text-slate-deep hover:bg-ink hover:text-paper"
              >
                Lier un MikroTik
              </Link>
            </div>
          )}
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          {/* Pas de légende ajoutée ici : LineChart en rend déjà une, avec les
              bonnes couleurs, et qui bascule sur les valeurs du jour au survol.
              En poser une seconde ferait doublon et perdrait ce comportement. */}
          <h2 className="font-semibold text-ink">Aperçu</h2>

          {hasAnyData && data ? (
            <DailyChart daily={data.daily} />
          ) : (
            <div className="mt-4 flex h-48 flex-col items-center justify-center rounded-lg border border-line bg-clay text-center">
              <p className="text-sm font-medium text-ink">Aucune donnée pour cette période</p>
              <p className="mt-1 max-w-xs text-xs text-ink-soft">
                Les paiements encaissés au portail captif et les dépenses apparaîtront ici dès
                la première écriture.
              </p>
            </div>
          )}

          {/* Ventilation — annoncée comme telle, et non déguisée en légende. */}
          {data && (
            <dl className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-4">
              {[
                ["Revenu brut", data.kpis.grossCents],
                ["Commissions", data.kpis.commissionCents],
                ["Dépenses", data.kpis.expenseCents],
                ["Revenu net", data.kpis.netCents],
              ].map(([label, value]) => (
                <div key={label as string} className="bg-paper px-3 py-2.5">
                  <dt className="text-[11px] text-ink-soft">{label}</dt>
                  <dd className="mt-0.5 text-sm font-semibold tabular-nums text-ink">
                    {formatFcfa(value as number)}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </Card>

        <div className="space-y-4">
          <Card className="p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold text-ink">Paiements récents</h2>
              {hasSales && (
                <Link href="/admin/sales" className="text-xs font-semibold text-brand-deep hover:underline">
                  Tout voir →
                </Link>
              )}
            </div>
            {hasSales && data ? (
              <ul className="mt-3 divide-y divide-line" role="list">
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
              <p className="mt-4 text-sm text-ink-soft">Aucune vente sur cette période.</p>
            )}
          </Card>

          {/* Safecoin passe du bandeau pleine largeur au rail : c'est une
              information de superadmin, elle ne doit pas dominer les revenus.
              Le fond en dur #1c1917 devient le vert profond de la charte. */}
          {safecoin && (
            <Link
              href="/admin/safecoin"
              className="block rounded-xl bg-slate-deep p-5 text-white transition-colors hover:bg-[#0C2415]"
            >
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-brand">
                  Safecoin
                </p>
                <span className="font-mono text-[11px] text-white/60">
                  1 SC = {safecoin.rateFcfaPerSc.toLocaleString("fr-FR")} FCFA
                </span>
              </div>
              <dl className="mt-4 space-y-2.5">
                {[
                  ["Émis", safecoin.kpis.issued],
                  ["Consommés", safecoin.kpis.spent],
                  ["En circulation", safecoin.kpis.circulating],
                ].map(([label, value]) => (
                  <div key={label as string} className="flex items-baseline justify-between gap-3">
                    <dt className="text-sm text-white/65">{label}</dt>
                    <dd className="font-mono text-sm font-bold tabular-nums text-white">
                      {formatSc(value as number)}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="mt-4 text-xs font-semibold text-brand">Ouvrir la station →</p>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
