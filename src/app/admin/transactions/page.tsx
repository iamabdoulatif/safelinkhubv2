import { eq } from "drizzle-orm";
import { ArrowLeftRight } from "lucide-react";
import { getDb } from "@/lib/db";
import { floatTransactions, expenses, vouchers, packages } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import { getAdminDict } from "@/lib/i18n/admin";
import { getLocale } from "@/lib/i18n/server";

function formatFcfa(cents: number, locale: string) {
  return `FCFA ${Math.abs(cents).toLocaleString(locale)}`;
}

function formatDate(date: Date, locale: string) {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

type LedgerEntry = {
  id: string;
  date: Date;
  label: string;
  category: "deposit" | "withdrawal" | "expense" | "sale";
  amountCents: number; // positive = in, negative = out
  note: string | null;
};

/**
 * Unlike Solde flottant / Dépenses / Ventes (each scoped to one source),
 * this is the single combined audit trail across all three — every cash
 * movement an admin would need to reconcile in one place.
 */
export default async function TransactionsPage() {
  const [session, locale, dict] = await Promise.all([getSession(), getLocale(), getAdminDict()]);
  const t = dict.finance.transactions;
  const db = getDb();

  if (!session) {
    return (
      <div className="mx-auto max-w-5xl">
        <h1 className="text-2xl font-bold text-ink">{t.title}</h1>
      </div>
    );
  }

  const [floatRows, expenseRows, voucherRows, packageRows] = await Promise.all([
    db.select().from(floatTransactions).where(eq(floatTransactions.orgId, session.orgId)),
    db.select().from(expenses).where(eq(expenses.orgId, session.orgId)),
    db.select().from(vouchers).where(eq(vouchers.orgId, session.orgId)),
    db.select().from(packages).where(eq(packages.orgId, session.orgId)),
  ]);

  const packageById = new Map(packageRows.map((p) => [p.id, p]));

  const entries: LedgerEntry[] = [
    ...floatRows.map((transaction) => ({
      id: transaction.id,
      date: transaction.createdAt,
      label: transaction.type === "deposit" ? t.floatDeposit : t.floatWithdrawal,
      category: (transaction.type === "deposit" ? "deposit" : "withdrawal") as LedgerEntry["category"],
      amountCents: transaction.type === "deposit" ? transaction.amountCents : -transaction.amountCents,
      note: transaction.note,
    })),
    ...expenseRows.map((e) => ({
      id: e.id,
      date: e.expenseDate,
      label: e.category,
      category: "expense" as const,
      amountCents: -e.amountCents,
      note: e.note,
    })),
    ...voucherRows
      .filter((v) => v.packageId && packageById.has(v.packageId))
      .map((v) => {
        const pkg = packageById.get(v.packageId!)!;
        return {
          id: v.id,
          date: v.createdAt,
          label: t.saleDetail(pkg.name, v.username),
          category: "sale" as const,
          amountCents: pkg.priceCents,
          note: v.note,
        };
      }),
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  const totalIn = entries.filter((e) => e.amountCents > 0).reduce((s, e) => s + e.amountCents, 0);
  const totalOut = entries.filter((e) => e.amountCents < 0).reduce((s, e) => s + e.amountCents, 0);
  const net = totalIn + totalOut;

  const visible = entries.slice(0, 300);

  const categoryStyle: Record<LedgerEntry["category"], string> = {
    deposit: "bg-clay text-ok",
    sale: "bg-clay text-ok",
    withdrawal: "bg-clay text-warn",
    expense: "bg-err-soft text-err",
  };

  return (
    <div className="mx-auto max-w-5xl animate-fade-in-up">
      <div className="flex items-center gap-2">
        <ArrowLeftRight className="h-5 w-5 text-ink" />
        <h1 className="text-2xl font-bold text-ink">{t.title}</h1>
      </div>
      <p className="mt-1 text-sm text-ink-soft">
        {t.description}
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="border border-line bg-paper p-5 hover-lift rounded-xl">
          <p className="text-sm font-medium text-ink-soft">{t.totalIn}</p>
          <p className="mt-1 text-2xl font-bold text-ok">{formatFcfa(totalIn, locale)}</p>
        </div>
        <div className="border border-line bg-paper p-5 hover-lift rounded-xl">
          <p className="text-sm font-medium text-ink-soft">{t.totalOut}</p>
          <p className="mt-1 text-2xl font-bold text-err">{formatFcfa(totalOut, locale)}</p>
        </div>
        <div className="border border-line bg-paper p-5 hover-lift rounded-xl">
          <p className="text-sm font-medium text-ink-soft">{t.net}</p>
          <p className={`mt-1 text-2xl font-bold ${net < 0 ? "text-err" : "text-ink"}`}>
            {net < 0 ? "-" : ""}
            {formatFcfa(net, locale)}
          </p>
        </div>
      </div>

      <div className="mt-6 overflow-hidden border border-line bg-paper">
        <div className="table-mobile-wrapper">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line-soft bg-clay text-ink-soft">
            <tr>
              <th className="px-4 py-3 font-medium">{t.date}</th>
              <th className="px-4 py-3 font-medium">{t.category}</th>
              <th className="px-4 py-3 font-medium">{t.detail}</th>
              <th className="px-4 py-3 font-medium">{t.amount}</th>
              <th className="px-4 py-3 font-medium">{t.note}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-soft">
            {visible.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-ink-soft">
                  {t.empty}
                </td>
              </tr>
            )}
            {visible.map((e) => (
              <tr key={`${e.category}-${e.id}`}>
                <td className="px-4 py-3 text-ink-soft">{formatDate(e.date, locale)}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${categoryStyle[e.category]}`}>
                    {t.categories[e.category]}
                  </span>
                </td>
                <td className="px-4 py-3 text-ink">{e.label}</td>
                <td
                  className={`px-4 py-3 font-medium ${
                    e.amountCents < 0 ? "text-err" : "text-ok"
                  }`}
                >
                  {e.amountCents < 0 ? "-" : "+"}
                  {formatFcfa(e.amountCents, locale)}
                </td>
                <td className="px-4 py-3 text-ink-soft">{e.note ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        {entries.length > visible.length && (
          <p className="border-t border-line-soft px-4 py-3 text-xs text-ink-soft">
            {t.display(visible.length, entries.length)}
          </p>
        )}
      </div>
    </div>
  );
}
