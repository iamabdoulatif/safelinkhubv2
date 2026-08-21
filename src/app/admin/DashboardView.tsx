import Link from "next/link";
import { AlertTriangle, ArrowUpRight, Router as RouterIcon, Ticket, Wifi } from "lucide-react";
import { type DailyPoint } from "@/lib/dashboard/queries";
import { type CountryRow } from "@/lib/dashboard/geography";
import {
  type ResellerState,
  RESELLER_PACK_FCFA,
  RESELLER_QUOTA,
  RESELLER_SETUP_FEE_CENTS,
} from "@/lib/billing/reseller";
import { formatSc } from "@/lib/safecoin/pricing";
import DateRangePicker from "./DateRangePicker";
import LineChart from "@/components/charts/LineChart";
import type { AdminDictionary } from "@/lib/i18n/admin/fr";
import { type Locale, HTML_LANG } from "@/lib/i18n/config";

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
  /** Répartition des comptes par pays — superadmin seulement, vide sinon. */
  countries: CountryRow[];
  reseller: ResellerState | null;
  daily: DailyPoint[];
  recentSales: DashboardSale[];
  safecoin: SafecoinSummary | null;
  rangeLabel: string;
  picker: { from: string; to: string; activePreset: string | null };
  /* Le dictionnaire arrive en PROP, comme les données : l'écran doit rester
     rendable par un banc d'essai sans session ni cookie. */
  t: AdminDictionary["dashboard"];
  locale: Locale;
};

/* Les formats de nombre et de date suivent la langue : « 4 000 » / « 4,000 »,
 * « 12 janv. » / « 12 Jan ». */
function formatters(locale: Locale) {
  const fcfa = new Intl.NumberFormat(HTML_LANG[locale]);
  const jour = new Intl.DateTimeFormat(HTML_LANG[locale], { day: "2-digit", month: "short" });
  const horodatage = new Intl.DateTimeFormat(HTML_LANG[locale], {
    dateStyle: "medium",
    timeStyle: "short",
  });
  return {
    formatFcfa: (cents: number) => `${fcfa.format(cents)} FCFA`,
    formatNumber: (n: number) => fcfa.format(n),
    formatDay: (day: string) => {
      const [y, m, d] = day.split("-").map(Number);
      return jour.format(new Date(y, m - 1, d));
    },
    formatDateTime: (date: Date) => horodatage.format(date),
  };
}

/* La table ne porte plus les libellés — ils viennent du dictionnaire, cherchés
 * par la même clé. Le graphique lit toujours la table, il ne la recopie pas. */
const SERIES = [
  { key: "gross", color: "var(--chart-1)" },
  { key: "expense", color: "var(--chart-2)" },
] as const;

function DailyChart({
  daily,
  t,
  formatDay,
}: {
  daily: DailyPoint[];
  t: AdminDictionary["dashboard"]["chart"];
  formatDay: (day: string) => string;
}) {
  return (
    <LineChart
      labels={daily.map((p) => formatDay(p.day))}
      series={SERIES.map((s) => ({
        key: s.key,
        label: t[s.key],
        color: s.color,
        values: daily.map((p) => (s.key === "gross" ? p.grossCents : p.expenseCents)),
      }))}
      unit="fcfa"
      ariaLabel={t.aria}
      emptyLabel={t.empty}
    />
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-line bg-paper ${className}`}>{children}</div>;
}

export default function DashboardView({ kpis, daily, recentSales, safecoin, countries, reseller, rangeLabel, picker, t, locale }: DashboardViewProps) {
  const { formatFcfa, formatNumber, formatDay, formatDateTime } = formatters(locale);
  const data = kpis ? { kpis, daily, recentSales } : null;
  const hasSales = (kpis?.salesCount ?? 0) > 0;
  const hasAnyData = hasSales || (kpis?.expenseCents ?? 0) > 0;
  const offline = kpis?.routersOffline ?? [];
  const total = kpis?.routersTotal ?? 0;
  const online = kpis?.routersOnline ?? 0;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink">{t.title}</h1>
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
            {t.offline.count(offline.length)}
          </p>
          <p className="min-w-0 flex-1 truncate font-mono text-xs text-ink-soft">
            {offline.join(" · ")}
          </p>
          <span className="text-xs font-semibold text-err">{t.offline.cta}</span>
        </Link>
      )}

      {reseller?.pendingPayment && (
        <div className="mt-4 flex flex-wrap items-center gap-4 rounded-xl border border-brand-deep bg-brand/15 px-4 py-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink">
              {t.reseller.pendingTitle}
            </p>
            <p className="mt-1 text-xs leading-5 text-ink-soft">
              {t.reseller.pendingText(
                formatNumber(RESELLER_PACK_FCFA),
                RESELLER_QUOTA,
                formatNumber(RESELLER_SETUP_FEE_CENTS),
              )}
            </p>
          </div>
          <Link
            href="/admin/billing?pack=revendeur"
            className="inline-flex shrink-0 items-center gap-2 rounded-full border border-line bg-brand px-5 py-2.5 text-sm font-bold text-slate-deep hover:bg-ink hover:text-paper"
          >
            {t.reseller.pendingCta}
          </Link>
        </div>
      )}

      {reseller?.active && (
        <p className="mt-4 text-xs text-ink-soft">
          {t.reseller.active(reseller.quotaLeft, reseller.quotaTotal)}
          {reseller.expiresAt
            ? t.reseller.activeUntil(
                new Intl.DateTimeFormat(HTML_LANG[locale], { dateStyle: "long" }).format(
                  reseller.expiresAt,
                ),
              )
            : ""}
          .
        </p>
      )}

      {/* Un chiffre domine, les autres le qualifient.
          Le pas de cascade est réduit à 45 ms — un tableau de bord se lit en
          urgence. Sur trois colonnes la séquence entière tient sous 150 ms,
          soit à peine plus qu'un rendu instantané. Le bandeau d'alerte, lui,
          n'est PAS retardé : il est au-dessus et sans classe de révélation. */}
      <div className="stagger mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3" style={{ "--stagger-step": "45ms" } as React.CSSProperties}>
        <Card className="reveal p-6 lg:col-span-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
            {t.cashed.label(rangeLabel)}
          </p>
          <p className="mt-2 text-4xl font-bold tabular-nums tracking-tight text-ink sm:text-5xl">
            {formatFcfa(data?.kpis.grossCents ?? 0)}
          </p>
          <p className="mt-2 text-sm text-ink-soft">
            <span className="font-semibold text-ink">{formatFcfa(data?.kpis.netCents ?? 0)}</span>{" "}
            {t.cashed.net(data?.kpis.salesCount ?? 0)}
          </p>

          <div className="mt-6 flex flex-wrap gap-2">
            <Link
              href="/admin/vouchers"
              className="inline-flex items-center gap-2 rounded-full border border-line bg-brand px-4 py-2 text-sm font-bold text-slate-deep hover:bg-ink hover:text-paper"
            >
              <Ticket aria-hidden="true" className="h-4 w-4" />
              {t.cashed.generateVouchers}
            </Link>
            <Link
              href="/admin/sales"
              className="inline-flex items-center gap-2 rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink hover:bg-clay"
            >
              {t.cashed.seeSales}
              <ArrowUpRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          </div>
        </Card>

        <Card className="reveal flex flex-col p-6">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">{t.fleet.title}</p>
          {total > 0 ? (
            <>
              <p className="mt-2 text-3xl font-bold tabular-nums text-ink">
                {online}
                <span className="text-lg font-medium text-ink-soft">{t.fleet.online(total)}</span>
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
                {t.fleet.sessions(data?.kpis.activeUsers ?? 0)}
              </p>
              <Link
                href="/admin/router"
                className="mt-auto pt-4 text-sm font-semibold text-brand-deep hover:underline"
              >
                {t.fleet.see}
              </Link>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center py-4 text-center">
              <RouterIcon aria-hidden="true" className="h-6 w-6 text-ink-soft" />
              <p className="mt-2 text-sm font-medium text-ink">{t.fleet.empty}</p>
              <Link
                href="/admin/settings/router-setup?new=1"
                className="mt-3 inline-flex items-center gap-2 rounded-full border border-line bg-brand px-4 py-2 text-sm font-bold text-slate-deep hover:bg-ink hover:text-paper"
              >
                {t.fleet.link}
              </Link>
            </div>
          )}
        </Card>
      </div>

      <div className="stagger mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3" style={{ "--stagger-step": "45ms" } as React.CSSProperties}>
        <Card className="reveal p-5 lg:col-span-2">
          {/* Pas de légende ajoutée ici : LineChart en rend déjà une, avec les
              bonnes couleurs, et qui bascule sur les valeurs du jour au survol.
              En poser une seconde ferait doublon et perdrait ce comportement. */}
          <h2 className="font-semibold text-ink">{t.chart.title}</h2>

          {hasAnyData && data ? (
            <DailyChart daily={data.daily} t={t.chart} formatDay={formatDay} />
          ) : (
            <div className="mt-4 flex h-48 flex-col items-center justify-center rounded-lg border border-line bg-clay text-center">
              <p className="text-sm font-medium text-ink">{t.chart.noDataTitle}</p>
              <p className="mt-1 max-w-xs text-xs text-ink-soft">{t.chart.noDataText}</p>
            </div>
          )}

          {/* Ventilation — annoncée comme telle, et non déguisée en légende. */}
          {data && (
            <dl className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-4">
              {[
                [t.breakdown.gross, data.kpis.grossCents],
                [t.breakdown.commissions, data.kpis.commissionCents],
                [t.breakdown.expenses, data.kpis.expenseCents],
                [t.breakdown.net, data.kpis.netCents],
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

        <div className="reveal space-y-4">
          <Card className="p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold text-ink">{t.recent.title}</h2>
              {hasSales && (
                <Link href="/admin/sales" className="text-xs font-semibold text-brand-deep hover:underline">
                  {t.recent.seeAll}
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
              <p className="mt-4 text-sm text-ink-soft">{t.recent.empty}</p>
            )}
          </Card>

          {countries.length > 0 && (
            <Card className="p-5">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="font-semibold text-ink">{t.countries.title}</h2>
                <span className="text-xs text-ink-soft">
                  {t.countries.total(countries.reduce((n, c) => n + c.accounts, 0))}
                </span>
              </div>
              <ul className="mt-3 space-y-2.5" role="list">
                {countries.map((c) => (
                  <li key={c.iso2 ?? "inconnu"}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="flex min-w-0 items-baseline gap-2">
                        <span aria-hidden="true">{c.flag}</span>
                        <span
                          className={`truncate text-sm ${c.iso2 ? "text-ink" : "italic text-ink-soft"}`}
                        >
                          {c.label}
                        </span>
                      </span>
                      <span className="shrink-0 text-sm font-semibold tabular-nums text-ink">
                        {c.accounts}
                        <span className="ml-1.5 text-xs font-normal text-ink-soft">
                          {Math.round(c.share * 100)}&nbsp;%
                        </span>
                      </span>
                    </div>
                    {/* La barre porte la même information que le pourcentage :
                        elle sert à comparer d'un coup d'œil, pas à l'énoncer.
                        D'où aria-hidden — la lire deux fois n'aide personne. */}
                    <div aria-hidden="true" className="mt-1 h-1.5 rounded-full bg-clay">
                      <div
                        className={`h-full rounded-full ${c.iso2 ? "bg-brand" : "bg-line"}`}
                        style={{ width: `${Math.max(c.share * 100, 2)}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}

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
                  {t.safecoin.title}
                </p>
                <span className="font-mono text-[11px] text-white/60">
                  {t.safecoin.rate(formatNumber(safecoin.rateFcfaPerSc))}
                </span>
              </div>
              <dl className="mt-4 space-y-2.5">
                {[
                  [t.safecoin.issued, safecoin.kpis.issued],
                  [t.safecoin.spent, safecoin.kpis.spent],
                  [t.safecoin.circulating, safecoin.kpis.circulating],
                ].map(([label, value]) => (
                  <div key={label as string} className="flex items-baseline justify-between gap-3">
                    <dt className="text-sm text-white/65">{label}</dt>
                    <dd className="font-mono text-sm font-bold tabular-nums text-white">
                      {formatSc(value as number)}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="mt-4 text-xs font-semibold text-brand">{t.safecoin.open}</p>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
