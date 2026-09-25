import { and, eq, gte, lte } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { expenses, floatTransactions } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import { getPaidSales } from "@/lib/sales/paid-orders";
import { buildLedger, ledgerCsv, summarizeLedger, LEDGER_CATEGORIES, type LedgerCategory } from "@/lib/finance/ledger";
import { resolveRange } from "@/lib/dashboard/range";
import { getAdminDict } from "@/lib/i18n/admin";
import { getLocale } from "@/lib/i18n/server";
import TransactionsView from "./TransactionsView";

/**
 * Journal combiné — solde flottant, dépenses et ventes ENCAISSÉES — sur une
 * période. Cette page ne fait que chercher les données ; le rendu vit dans
 * TransactionsView.
 */
export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; type?: string; page?: string }>;
}) {
  const [session, locale, dict, params] = await Promise.all([getSession(), getLocale(), getAdminDict(), searchParams]);
  const t = dict.finance.transactions;
  const now = new Date();
  const range = resolveRange(params, now);

  const [floats, expenseRows, sales] = session
    ? await Promise.all([
        getDb()
          .select()
          .from(floatTransactions)
          .where(
            and(
              eq(floatTransactions.orgId, session.orgId),
              gte(floatTransactions.createdAt, range.from),
              lte(floatTransactions.createdAt, range.to),
            ),
          ),
        getDb()
          .select()
          .from(expenses)
          .where(
            and(eq(expenses.orgId, session.orgId), gte(expenses.expenseDate, range.from), lte(expenses.expenseDate, range.to)),
          ),
        getPaidSales(session.orgId, { from: range.from, to: range.to }),
      ])
    : [[], [], []];

  const entries = buildLedger({ floats, expenses: expenseRows, sales }, t);
  const category = LEDGER_CATEGORIES.includes(params.type as LedgerCategory) ? (params.type as LedgerCategory) : null;
  // Export de la période ENTIÈRE (toutes catégories) ; BOM UTF-8 pour Excel.
  const csvHref = `data:text/csv;charset=utf-8,${encodeURIComponent(`﻿${ledgerCsv(entries, (c) => t.categories[c])}`)}`;

  return (
    <TransactionsView
      t={t}
      locale={locale}
      entries={entries}
      summary={summarizeLedger(entries)}
      picker={{ from: range.fromParam, to: range.toParam, activePreset: range.activePreset }}
      category={category}
      page={Number(params.page) || 1}
      csvHref={csvHref}
    />
  );
}
