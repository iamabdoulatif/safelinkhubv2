// Agrégats du tableau de bord — lectures seules, volontairement hors d'un
// fichier "use server" (cf. lib/blog/queries.ts pour la même convention).
import { and, eq, gte, lte, desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { vouchers, packages, expenses, walletTransactions, routers } from "@/lib/db/schema";

export type DashboardRange = { from: Date; to: Date };

export type DailyPoint = {
  /** Clé jour au format YYYY-MM-DD (fuseau serveur). */
  day: string;
  grossCents: number;
  commissionCents: number;
  expenseCents: number;
};

export type RecentSale = {
  id: string;
  username: string;
  packageName: string;
  priceCents: number;
  createdAt: Date;
};

function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/** Liste des clés jour couvrant [from, to] pour que le graphique montre
 * aussi les jours sans vente. */
function enumerateDays(from: Date, to: Date): string[] {
  const days: string[] = [];
  const cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  while (cursor <= end && days.length < 366) {
    days.push(dayKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

export async function getDashboardData(orgId: string, range: DashboardRange) {
  const db = getDb();

  const [sales, rangeExpenses, walletRows, orgRouters] = await Promise.all([
    db
      .select({
        id: vouchers.id,
        username: vouchers.username,
        createdAt: vouchers.createdAt,
        packageName: packages.name,
        priceCents: packages.priceCents,
        commissionCents: packages.commissionCents,
      })
      .from(vouchers)
      .innerJoin(packages, eq(vouchers.packageId, packages.id))
      .where(
        and(
          eq(vouchers.orgId, orgId),
          gte(vouchers.createdAt, range.from),
          lte(vouchers.createdAt, range.to),
        ),
      )
      .orderBy(desc(vouchers.createdAt)),
    db
      .select({ amountCents: expenses.amountCents, expenseDate: expenses.expenseDate })
      .from(expenses)
      .where(
        and(
          eq(expenses.orgId, orgId),
          gte(expenses.expenseDate, range.from),
          lte(expenses.expenseDate, range.to),
        ),
      ),
    // Le crédit du compte est un solde cumulatif : toutes les écritures,
    // pas seulement celles de la période.
    db
      .select({ type: walletTransactions.type, amountCents: walletTransactions.amountCents })
      .from(walletTransactions)
      .where(and(eq(walletTransactions.orgId, orgId), eq(walletTransactions.status, "completed"))),
    db
      .select({ status: routers.status, activeUsers: routers.activeUsers })
      .from(routers)
      .where(eq(routers.orgId, orgId)),
  ]);

  const grossCents = sales.reduce((sum, s) => sum + s.priceCents, 0);
  const commissionCents = sales.reduce((sum, s) => sum + s.commissionCents, 0);
  const expenseCents = rangeExpenses.reduce((sum, e) => sum + e.amountCents, 0);
  const netCents = grossCents - commissionCents - expenseCents;

  const creditCents = walletRows.reduce(
    (sum, t) => sum + (t.type === "topup" ? t.amountCents : -t.amountCents),
    0,
  );

  const byDay = new Map<string, DailyPoint>(
    enumerateDays(range.from, range.to).map((day) => [
      day,
      { day, grossCents: 0, commissionCents: 0, expenseCents: 0 },
    ]),
  );
  for (const s of sales) {
    const point = byDay.get(dayKey(s.createdAt));
    if (point) {
      point.grossCents += s.priceCents;
      point.commissionCents += s.commissionCents;
    }
  }
  for (const e of rangeExpenses) {
    const point = byDay.get(dayKey(e.expenseDate));
    if (point) point.expenseCents += e.amountCents;
  }

  const routersOnline = orgRouters.filter((r) => r.status === "online").length;
  const activeUsers = orgRouters.reduce((sum, r) => sum + (r.activeUsers ?? 0), 0);

  return {
    kpis: {
      grossCents,
      commissionCents,
      expenseCents,
      netCents,
      creditCents,
      salesCount: sales.length,
      routersTotal: orgRouters.length,
      routersOnline,
      activeUsers,
    },
    daily: [...byDay.values()],
    recentSales: sales.slice(0, 6) as RecentSale[],
  };
}
