import { getSession, isSuperAdmin } from "@/lib/auth/session";
import { getDashboardData } from "@/lib/dashboard/queries";
import { getMonthlySeries } from "@/lib/dashboard/monthly";
import { getSafecoinReport } from "@/lib/safecoin/queries";
import { getAccountsByCountry } from "@/lib/dashboard/geography";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { organizations } from "@/lib/db/schema";
import { resellerState } from "@/lib/billing/reseller";
import DashboardView from "./DashboardView";
import { getAdminDict } from "@/lib/i18n/admin";
import { getLocale } from "@/lib/i18n/server";
import { HTML_LANG } from "@/lib/i18n/config";

/* Cette page ne fait plus que CHERCHER les données et résoudre la période.
 * Tout le rendu vit dans DashboardView, qui ne connaît ni base ni session —
 * c'est ce qui permet de l'inspecter visuellement sans se connecter à /admin. */

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

  /* Les deux lectures sont indépendantes : la première suit la période du
     sélecteur, la seconde regarde toujours les six derniers mois. */
  const [data, monthly] = session
    ? await Promise.all([
        getDashboardData(session.orgId, { from, to: toEnd }),
        getMonthlySeries(session.orgId, now),
      ])
    : [null, null];
  // Réservé au superadmin : la répartition porte sur TOUS les comptes du SaaS,
  // pas sur ceux d'une organisation. L'exposer à un admin ordinaire lui
  // montrerait le portefeuille clients de la plateforme.
  const superadmin = Boolean(session && isSuperAdmin(session.role));
  const [safecoin, countries] = await Promise.all([
    superadmin ? getSafecoinReport({ from, to: toEnd }) : null,
    superadmin ? getAccountsByCountry() : [],
  ]);

  // Tolérant au schéma en retard : sans les colonnes, personne n'est revendeur
  // et le bandeau ne s'affiche pas — jamais l'inverse.
  const [orgRow] = session
    ? await getDb()
        .select({
          accountType: organizations.accountType,
          resellerActivatedAt: organizations.resellerActivatedAt,
          resellerExpiresAt: organizations.resellerExpiresAt,
          resellerQuotaUsed: organizations.resellerQuotaUsed,
        })
        .from(organizations)
        .where(eq(organizations.id, session.orgId))
        .limit(1)
        .catch(() => [])
    : [];

  const [locale, adminDict] = await Promise.all([getLocale(), getAdminDict()]);
  const fmt = new Intl.DateTimeFormat(HTML_LANG[locale], { dateStyle: "medium" });

  return (
    <DashboardView
      kpis={data?.kpis ?? null}
      monthly={monthly}
      daily={data?.daily ?? []}
      recentSales={data?.recentSales ?? []}
      safecoin={
        safecoin
          ? { rateFcfaPerSc: safecoin.rateFcfaPerSc, kpis: safecoin.kpis }
          : null
      }
      countries={countries}
      reseller={orgRow ? resellerState(orgRow) : null}
      rangeLabel={`${fmt.format(from)} – ${fmt.format(to)}`}
      picker={{ from: fromParam, to: toParamStr, activePreset }}
      t={adminDict.dashboard}
      locale={locale}
    />
  );
}
