import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  Coins,
  Percent,
  Receipt,
  ChevronRight,
  Link2,
  UserPlus,
  Router as RouterIcon,
  ShoppingBag,
  Ticket,
  TrendingUp,
  WalletCards,
  Wifi,
} from "lucide-react";
import { type DailyPoint } from "@/lib/dashboard/queries";
import { type MonthlySeries } from "@/lib/dashboard/monthly";
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
import BarChart from "@/components/charts/BarChart";
import { buttonClass } from "@/components/ui/Button";
import { Table, Td, Th, Tr } from "@/components/ui/Table";
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
  /** Six derniers mois, indépendants de la période du sélecteur. */
  monthly: MonthlySeries | null;
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
  /** Raccourcis autorisés pour ce rôle (filtrés par la page). */
  quickActions: QuickAction[];
  t: AdminDictionary["dashboard"];
  locale: Locale;
};

export type QuickAction = "router" | "packages" | "expense" | "members";

const QUICK_ACTIONS: Record<QuickAction, { href: string; icon: typeof Coins }> = {
  router: { href: "/admin/settings/router-setup?new=1", icon: Link2 },
  packages: { href: "/admin/packages", icon: Ticket },
  expense: { href: "/admin/expenses", icon: Receipt },
  members: { href: "/admin/members", icon: UserPlus },
};

/* Les formats de nombre et de date suivent la langue : « 4 000 » / « 4,000 »,
 * « 12 janv. » / « 12 Jan ». */
function formatters(locale: Locale) {
  const fcfa = new Intl.NumberFormat(HTML_LANG[locale]);
  const compact = new Intl.NumberFormat(HTML_LANG[locale], {
    notation: "compact",
    maximumFractionDigits: 1,
  });
  const jour = new Intl.DateTimeFormat(HTML_LANG[locale], { day: "2-digit", month: "short" });
  const horodatage = new Intl.DateTimeFormat(HTML_LANG[locale], {
    dateStyle: "medium",
    timeStyle: "short",
  });
  return {
    formatFcfa: (cents: number) => `${fcfa.format(cents)} FCFA`,
    /* Tuiles KPI : « 4,8 M FCFA » au-delà du million — sept chiffres collés ne
       se lisent pas d'un coup d'œil, et c'est un coup d'œil qu'on demande à
       une tuile. La valeur exacte reste au survol (title) et dans les écrans
       de détail, qui gardent le format long. */
    formatFcfaCompact: (cents: number) =>
      Math.abs(cents) >= 1_000_000
        ? `${compact.format(cents)} FCFA`
        : `${fcfa.format(cents)} FCFA`,
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

/**
 * Tuile de compteur : libellé, valeur dominante, précision, et un lien vers
 * l'écran qui la détaille — le « More… » de la référence.
 *
 * Même famille visuelle que les cartes de /admin/analytics : filet d'accent en
 * haut, icône en haut à droite, valeur en chiffres tabulaires. La pastille
 * d'argile derrière l'icône remplace le quart de disque pastel de la
 * référence : le motif est repris, la couleur reste celle de la charte.
 *
 * Toujours un lien : une tuile qui affiche un compteur sans donner accès à son
 * détail oblige à retrouver l'écran à la main.
 */
function StatTile({
  label,
  value,
  fullValue,
  hint,
  href,
  more,
  icon: Icon,
  accent = "brand",
  compact = false,
  children,
}: {
  label: string;
  value: string;
  /** Valeur exacte, montrée au survol quand `value` est abrégée (« 4,8 M »). */
  fullValue?: string;
  hint: string;
  href: string;
  more: string;
  icon: typeof WalletCards;
  accent?: "brand" | "ok" | "err" | "ink";
  /** Rang secondaire : même structure, chiffre plus petit, sans pastille. */
  compact?: boolean;
  /** Complément sous la valeur — la barre segmentée du parc, par exemple. */
  children?: React.ReactNode;
}) {
  /* L'accent ne se montre plus QU'AU SURVOL. Huit filets colorés en
     permanence faisaient une rangée d'arcs-en-ciel là où la charte ne pose la
     couleur que sur ce qu'on désigne. Le trait garde ses 4 px au repos, en
     couleur de bordure : la géométrie ne bouge donc pas au survol, seule la
     teinte change. `focus-visible` double le survol pour le clavier — sans
     lui, une tabulation ne montrerait rien. */
  const accents = {
    brand: "hover:border-t-brand focus-visible:border-t-brand",
    ok: "hover:border-t-ok focus-visible:border-t-ok",
    err: "hover:border-t-err focus-visible:border-t-err",
    ink: "hover:border-t-ink focus-visible:border-t-ink",
  } as const;
  return (
    <Link
      href={href}
      className={`tile-hover flex h-full flex-col rounded-xl border border-line border-t-4 border-t-line bg-paper transition-colors ${compact ? "p-3.5" : "p-4 sm:p-5"} ${accents[accent]}`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-medium text-ink-soft">{label}</p>
        {!compact && (
          <span className="tile-hover-icon flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-clay">
            <Icon aria-hidden="true" className="h-4 w-4 text-ink" />
          </span>
        )}
      </div>
      <p
        title={fullValue}
        className={`tabular-nums tracking-tight text-ink ${compact ? "mt-1.5 text-lg font-semibold" : "mt-3 text-xl font-semibold leading-7 sm:text-[28px] sm:leading-8"}`}
      >
        {value}
      </p>
      {children}
      <p className="mt-1 text-xs text-ink-soft">{hint}</p>
      <span className="mt-auto inline-flex items-center gap-1 pt-3 text-xs font-semibold text-brand-deep">
        {more}
        <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" />
      </span>
    </Link>
  );
}

export default function DashboardView({ kpis, monthly, daily, recentSales, safecoin, countries, reseller, rangeLabel, picker, quickActions, t, locale }: DashboardViewProps) {
  const { formatFcfa, formatFcfaCompact, formatNumber, formatDay, formatDateTime } = formatters(locale);
  /* « 2026-08 » → « août ». Le libellé d'axe doit rester court : six barres
     partagent la largeur d'une carte de graphique. */
  const moisCourt = new Intl.DateTimeFormat(HTML_LANG[locale], { month: "short" });
  const formatMonth = (key: string) => {
    const [y, m] = key.split("-").map(Number);
    return moisCourt.format(new Date(y, m - 1, 1));
  };
  const data = kpis ? { kpis, daily, recentSales } : null;
  /* Une tuile monétaire = valeur compacte affichée + valeur exacte au survol,
     calculées depuis UNE seule lecture du compteur : répéter `kpis.xxxCents`
     dans deux props ferait double emploi (cf. test dashboard-tiles). */
  const fcfaTile = (cents: number) => ({
    value: formatFcfaCompact(cents),
    fullValue: formatFcfa(cents),
  });
  const hasSales = (kpis?.salesCount ?? 0) > 0;
  const hasAnyData = hasSales || (kpis?.expenseCents ?? 0) > 0;
  const offline = kpis?.routersOffline ?? [];
  const total = kpis?.routersTotal ?? 0;
  const online = kpis?.routersOnline ?? 0;

  // Rail de droite du bloc « activité » : n'existe que pour le superadmin.
  const superRail = countries.length > 0 || Boolean(safecoin);

  return (
    <div className="space-y-6">
      {/* En-tête : titre et période à gauche, UNE action principale à droite ;
          le sélecteur de période dessous, à pleine largeur utile. */}
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-ink">{t.title}</h1>
            <p className="mt-1 text-sm text-ink-soft">{t.period(rangeLabel)}</p>
          </div>
          <Link href="/admin/vouchers" className={buttonClass({ variant: "primary" })}>
            <Ticket aria-hidden="true" className="h-4 w-4" />
            {t.cashed.generateVouchers}
          </Link>
        </div>
        <DateRangePicker from={picker.from} to={picker.to} activePreset={picker.activePreset} />
      </div>

      {/* Ce qui exige une action passe AVANT les chiffres : les routeurs tombés
          sont nommés, avec un accès direct au diagnostic. */}
      {offline.length > 0 && (
        <Link
          href="/admin/router?status=offline"
          className="flex flex-wrap items-center gap-3 rounded-xl border border-err/30 bg-err-soft px-4 py-3 transition-colors hover:border-err/50"
        >
          <AlertTriangle aria-hidden="true" className="h-5 w-5 shrink-0 text-err" />
          <p className="text-sm font-semibold text-err">{t.offline.count(offline.length)}</p>
          <p className="min-w-0 flex-1 truncate font-mono text-xs text-ink-soft">
            {offline.join(" · ")}
          </p>
          <span className={buttonClass({ variant: "outline", size: "sm" })}>{t.offline.cta}</span>
        </Link>
      )}

      {reseller?.pendingPayment && (
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-brand-deep/30 bg-brand/15 px-4 py-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink">{t.reseller.pendingTitle}</p>
            <p className="mt-1 text-xs leading-5 text-ink-soft">
              {t.reseller.pendingText(
                formatNumber(RESELLER_PACK_FCFA),
                RESELLER_QUOTA,
                formatNumber(RESELLER_SETUP_FEE_CENTS),
              )}
            </p>
          </div>
          <Link href="/admin/billing?pack=revendeur" className={buttonClass({ variant: "secondary" })}>
            {t.reseller.pendingCta}
          </Link>
        </div>
      )}

      {reseller?.active && (
        <p className="text-xs text-ink-soft">
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

      {/* 1. KPI : quatre chiffres majeurs, puis quatre compteurs compacts.
          Les huit restent cliquables vers leur écran. */}
      <section>
        <h2 className="sr-only">{t.tiles.title}</h2>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          <StatTile
            label={t.tiles.gross}
            {...fcfaTile(data?.kpis.grossCents ?? 0)}
            hint={t.tiles.grossHint(rangeLabel)}
            href="/admin/sales"
            more={t.tiles.more}
            icon={Coins}
            accent="brand"
          />
          <StatTile
            label={t.tiles.net}
            {...fcfaTile(data?.kpis.netCents ?? 0)}
            hint={t.tiles.netHint}
            href="/admin/sales"
            more={t.tiles.more}
            icon={TrendingUp}
            accent="ok"
          />
          <StatTile
            label={t.tiles.routers}
            value={total > 0 ? `${online}` : "—"}
            hint={total > 0 ? t.tiles.routersHint(total) : t.tiles.routersEmpty}
            href={total > 0 ? "/admin/router" : "/admin/settings/router-setup?new=1"}
            more={total > 0 ? t.tiles.more : t.fleet.link}
            icon={RouterIcon}
            accent={offline.length > 0 ? "err" : "ok"}
          >
            {total > 0 && (
              <span className="mt-2 flex gap-1" aria-hidden="true">
                {Array.from({ length: total }).map((_, i) => (
                  <span
                    key={i}
                    className={`h-1.5 flex-1 rounded-full ${i < online ? "bg-ok" : "bg-err"}`}
                  />
                ))}
              </span>
            )}
          </StatTile>
          <StatTile
            label={t.tiles.sessions}
            value={formatNumber(data?.kpis.activeUsers ?? 0)}
            hint={t.tiles.sessionsHint}
            href="/admin/usage-analytics"
            more={t.tiles.more}
            icon={Wifi}
            accent="ink"
          />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatTile
            compact
            label={t.tiles.sales}
            value={formatNumber(data?.kpis.salesCount ?? 0)}
            hint={t.tiles.salesHint}
            href="/admin/sales"
            more={t.tiles.more}
            icon={ShoppingBag}
            accent="brand"
          />
          <StatTile
            compact
            label={t.tiles.commissions}
            {...fcfaTile(data?.kpis.commissionCents ?? 0)}
            hint={t.tiles.commissionsHint}
            href="/admin/transactions"
            more={t.tiles.more}
            icon={Percent}
            accent="ink"
          />
          <StatTile
            compact
            label={t.tiles.expenses}
            {...fcfaTile(data?.kpis.expenseCents ?? 0)}
            hint={t.tiles.expensesHint}
            href="/admin/expenses"
            more={t.tiles.more}
            icon={Receipt}
            accent="err"
          />
          <StatTile
            compact
            label={t.tiles.credit}
            {...fcfaTile(data?.kpis.creditCents ?? 0)}
            hint={t.tiles.creditHint}
            href="/admin/billing"
            more={t.tiles.more}
            icon={WalletCards}
            accent="ok"
          />
        </div>
        {/* fin de la grille des compteurs */}
      </section>

      {/* 2. Tendance de la période + 3. actions : ce qu'on regarde, puis ce
          qu'on fait. */}
      <div
        className="stagger grid grid-cols-1 gap-4 lg:grid-cols-3"
        style={{ "--stagger-step": "45ms" } as React.CSSProperties}
      >
        <Card className="reveal p-5 lg:col-span-2">
          {/* LineChart rend déjà sa légende (qui bascule sur les valeurs du
              jour au survol) : en poser une seconde ferait doublon. */}
          <h2 className="text-base font-semibold text-ink">{t.chart.title}</h2>
          {hasAnyData && data ? (
            <DailyChart daily={data.daily} t={t.chart} formatDay={formatDay} />
          ) : (
            <div className="mt-4 flex h-48 flex-col items-center justify-center rounded-lg border border-dashed border-line-strong/50 text-center">
              <p className="text-sm font-medium text-ink">{t.chart.noDataTitle}</p>
              <p className="mt-1 max-w-xs text-xs text-ink-soft">{t.chart.noDataText}</p>
            </div>
          )}
        </Card>

        {quickActions.length > 0 && (
          <Card className="reveal p-5">
            <h2 className="text-base font-semibold text-ink">{t.quick.title}</h2>
            <ul className="mt-2 divide-y divide-line-soft" role="list">
              {quickActions.map((key) => {
                const { href, icon: Icon } = QUICK_ACTIONS[key];
                return (
                  <li key={key}>
                    <Link href={href} className="group flex min-h-14 items-center gap-3 py-2">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-clay">
                        <Icon aria-hidden="true" className="h-4 w-4 text-ink" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-ink group-hover:text-brand-deep">
                          {t.quick[key]}
                        </span>
                        <span className="block truncate text-xs text-ink-soft">
                          {t.quick[`${key}Hint`]}
                        </span>
                      </span>
                      <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-ink-soft" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </div>

      {/* 4. Activité récente + détail superadmin (pays, Safecoin) en rail. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <section className={superRail ? "lg:col-span-2" : "lg:col-span-3"}>
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h2 className="text-base font-semibold text-ink">{t.recent.title}</h2>
            {hasSales && (
              <Link href="/admin/sales" className="text-[13px] font-semibold text-brand-deep hover:underline">
                {t.recent.seeAll}
              </Link>
            )}
          </div>
          {hasSales && data ? (
            <Table caption={t.recent.title}>
              <thead>
                <tr>
                  <Th>{t.recent.colPackage}</Th>
                  <Th>{t.recent.colUser}</Th>
                  <Th numeric>{t.recent.colAmount}</Th>
                  <Th numeric className="hidden sm:table-cell">
                    {t.recent.colDate}
                  </Th>
                </tr>
              </thead>
              <tbody>
                {data.recentSales.map((s) => (
                  <Tr key={s.id}>
                    <Td className="font-medium text-ink">
                      <span className="block max-w-[14rem] truncate">{s.packageName}</span>
                    </Td>
                    <Td className="font-mono text-xs text-ink-soft">
                      <span className="block max-w-[10rem] truncate">{s.username}</span>
                    </Td>
                    <Td numeric className="whitespace-nowrap font-semibold text-ink">
                      {formatFcfa(s.priceCents)}
                    </Td>
                    <Td numeric className="hidden whitespace-nowrap text-ink-soft sm:table-cell">
                      {formatDateTime(s.createdAt)}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <p className="rounded-xl border border-dashed border-line-strong/50 bg-paper px-4 py-8 text-center text-sm text-ink-soft">
              {t.recent.empty}
            </p>
          )}
        </section>

        {superRail && (
          <div className="space-y-4">
            {countries.length > 0 && (
              <Card className="p-5">
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="text-base font-semibold text-ink">{t.countries.title}</h2>
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
                          <span className={`truncate text-sm ${c.iso2 ? "text-ink" : "italic text-ink-soft"}`}>
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
                      {/* Même information que le pourcentage : aria-hidden. */}
                      <div aria-hidden="true" className="mt-1 h-1.5 rounded-full bg-line-soft">
                        <div
                          className={`h-full rounded-full ${c.iso2 ? "bg-brand-deep" : "bg-line-strong"}`}
                          style={{ width: `${Math.max(c.share * 100, 2)}%` }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            {/* Safecoin : information de superadmin, dans le rail, jamais au
                -dessus des revenus. */}
            {safecoin && (
              <Link
                href="/admin/safecoin"
                className="block rounded-xl bg-slate-deep p-5 text-white transition-colors hover:bg-slate-deep/90"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-brand">{t.safecoin.title}</p>
                  <span className="font-mono text-xs text-white/70">
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
                      <dt className="text-sm text-white/70">{label}</dt>
                      <dd className="font-mono text-sm font-semibold tabular-nums text-white">
                        {formatSc(value as number)}
                      </dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-4 text-xs font-semibold text-brand">{t.safecoin.open}</p>
              </Link>
            )}
          </div>
        )}
      </div>

      {/* 5. Détail : histogrammes des six derniers mois. Ils IGNORENT le
          sélecteur de période — sinon la vue par défaut (le mois en cours)
          n'afficherait qu'une barre par graphique, ce qui ne compare rien. */}
      {monthly && (
        <section>
          <h2 className="text-base font-semibold text-ink">{t.charts.title}</h2>
          <p className="mt-1 text-[13px] text-ink-soft">{t.charts.subtitle}</p>
          <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {(
              [
                [t.charts.payments, monthly.payments, "count"],
                [t.charts.gross, monthly.gross, "fcfa"],
                [t.charts.commissions, monthly.commissions, "fcfa"],
                [t.charts.expenses, monthly.expenses, "fcfa"],
                [t.charts.topups, monthly.topups, "fcfa"],
                [t.charts.routers, monthly.routers, "count"],
              ] as const
            ).map(([titre, points, unit]) => (
              <Card key={titre} className="p-4">
                <h3 className="text-sm font-semibold text-ink">{titre}</h3>
                <BarChart
                  labels={points.map((p) => formatMonth(p.month))}
                  values={points.map((p) => p.value)}
                  unit={unit}
                  ariaLabel={titre}
                  emptyLabel={t.chart.empty}
                />
                <p className="mt-1 text-center text-xs text-ink-soft">{t.charts.month}</p>
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
