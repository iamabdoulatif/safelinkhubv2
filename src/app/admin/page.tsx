import { getSession, isSuperAdmin } from "@/lib/auth/session";
import { getDashboardData } from "@/lib/dashboard/queries";
import { getSafecoinReport } from "@/lib/safecoin/queries";
import { getAccountsByCountry } from "@/lib/dashboard/geography";
import DashboardView from "./DashboardView";

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

  const data = session ? await getDashboardData(session.orgId, { from, to: toEnd }) : null;
  // Réservé au superadmin : la répartition porte sur TOUS les comptes du SaaS,
  // pas sur ceux d'une organisation. L'exposer à un admin ordinaire lui
  // montrerait le portefeuille clients de la plateforme.
  const superadmin = Boolean(session && isSuperAdmin(session.role));
  const [safecoin, countries] = await Promise.all([
    superadmin ? getSafecoinReport({ from, to: toEnd }) : null,
    superadmin ? getAccountsByCountry() : [],
  ]);

  const fmt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" });

  return (
    <DashboardView
      kpis={data?.kpis ?? null}
      daily={data?.daily ?? []}
      recentSales={data?.recentSales ?? []}
      safecoin={
        safecoin
          ? { rateFcfaPerSc: safecoin.rateFcfaPerSc, kpis: safecoin.kpis }
          : null
      }
      countries={countries}
      rangeLabel={`${fmt.format(from)} – ${fmt.format(to)}`}
      picker={{ from: fromParam, to: toParamStr, activePreset }}
    />
  );
}
