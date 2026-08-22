// Séries MENSUELLES du tableau de bord — lectures seules, hors d'un fichier
// "use server" (même convention que queries.ts).
//
// Distinctes des séries journalières : celles-ci ignorent la période choisie
// dans le sélecteur et regardent toujours les N derniers mois. Un histogramme
// par mois répond à « combien ce mois-ci comparé aux précédents » ; le
// sélecteur, lui, cadre l'analyse fine d'une période donnée. Les faire suivre
// le sélecteur donnerait des graphiques à une seule barre par défaut.
import { and, eq, gte, lte } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { expenses, routers, walletTransactions } from "@/lib/db/schema";
import { getPaidSales } from "@/lib/sales/paid-orders";

export type MonthlyPoint = { month: string; value: number };

/** Nombre de mois affichés par les histogrammes. */
export const MONTHS_SHOWN = 6;

/** Clé mois « YYYY-MM », fuseau serveur — même convention que dayKey. */
export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Les `count` derniers mois, du plus ancien au plus récent, `end` inclus.
 *
 * Les mois VIDES sont conservés : un histogramme qui saute les mois sans
 * mouvement ferait lire « août, septembre » comme deux mois consécutifs alors
 * qu'il en manque quatre entre les deux.
 */
export function enumerateMonths(end: Date, count: number): string[] {
  const mois: string[] = [];
  const curseur = new Date(end.getFullYear(), end.getMonth(), 1);
  for (let i = 0; i < count; i++) {
    mois.unshift(monthKey(curseur));
    curseur.setMonth(curseur.getMonth() - 1);
  }
  return mois;
}

/** Début du premier des `count` derniers mois — borne basse des requêtes. */
export function monthsWindowStart(end: Date, count: number): Date {
  return new Date(end.getFullYear(), end.getMonth() - (count - 1), 1, 0, 0, 0, 0);
}

/** Ventile des lignes datées dans les mois donnés. Fonction pure. */
export function bucketByMonth(
  months: string[],
  rows: { date: Date; value: number }[],
): MonthlyPoint[] {
  const seaux = new Map<string, number>();
  for (const row of rows) {
    const cle = monthKey(row.date);
    seaux.set(cle, (seaux.get(cle) ?? 0) + row.value);
  }
  /* La sortie se construit à partir de `months`, jamais des lignes : une ligne
     hors fenêtre reste donc dans le seau et n'est simplement pas lue. C'est ce
     qui garantit qu'elle ne sera jamais rattachée au mois le plus proche —
     elle fausserait la barre d'un mois qu'elle ne concerne pas. */
  return months.map((month) => ({ month, value: seaux.get(month) ?? 0 }));
}

export type MonthlySeries = {
  months: string[];
  payments: MonthlyPoint[];
  gross: MonthlyPoint[];
  commissions: MonthlyPoint[];
  expenses: MonthlyPoint[];
  topups: MonthlyPoint[];
  routers: MonthlyPoint[];
};

/**
 * Six histogrammes, DEUX requêtes.
 *
 * Les ventes encaissées donnent à elles seules paiements, brut et commissions ;
 * le portefeuille et le parc sont de toute façon lus par le tableau de bord.
 * Une requête par graphique aurait multiplié les allers-retours pour des
 * données déjà en main.
 */
export async function getMonthlySeries(
  orgId: string,
  now: Date = new Date(),
  count: number = MONTHS_SHOWN,
): Promise<MonthlySeries> {
  const db = getDb();
  const months = enumerateMonths(now, count);
  const from = monthsWindowStart(now, count);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  const [ventes, depenses, recharges, parc] = await Promise.all([
    getPaidSales(orgId, { from, to }),
    db
      .select({ amountCents: expenses.amountCents, expenseDate: expenses.expenseDate })
      .from(expenses)
      .where(
        and(eq(expenses.orgId, orgId), gte(expenses.expenseDate, from), lte(expenses.expenseDate, to)),
      ),
    db
      .select({ amountCents: walletTransactions.amountCents, createdAt: walletTransactions.createdAt })
      .from(walletTransactions)
      .where(
        and(
          eq(walletTransactions.orgId, orgId),
          eq(walletTransactions.type, "topup"),
          eq(walletTransactions.status, "completed"),
          gte(walletTransactions.createdAt, from),
        ),
      ),
    db
      .select({ createdAt: routers.createdAt })
      .from(routers)
      .where(and(eq(routers.orgId, orgId), gte(routers.createdAt, from))),
  ]);

  return {
    months,
    payments: bucketByMonth(months, ventes.map((v) => ({ date: v.createdAt, value: 1 }))),
    gross: bucketByMonth(months, ventes.map((v) => ({ date: v.createdAt, value: v.priceCents }))),
    commissions: bucketByMonth(
      months,
      ventes.map((v) => ({ date: v.createdAt, value: v.commissionCents })),
    ),
    expenses: bucketByMonth(
      months,
      depenses.map((e) => ({ date: e.expenseDate, value: e.amountCents })),
    ),
    topups: bucketByMonth(
      months,
      recharges.map((r) => ({ date: r.createdAt, value: r.amountCents })),
    ),
    routers: bucketByMonth(months, parc.map((r) => ({ date: r.createdAt, value: 1 }))),
  };
}
