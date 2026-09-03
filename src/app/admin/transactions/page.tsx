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


  return (
    <div className="mx-auto max-w-5xl animate-fade-in-up">
      <div className="flex items-center gap-2">
        <ArrowLeftRight className="h-5 w-5 text-ink" />
        <h1 className="text-2xl font-bold text-ink">{t.title}</h1>
      </div>
      <p className="mt-1 text-sm text-ink-soft">
        {t.description}
      </p>

      {/* Trois cartes de même poids ne disaient pas quoi regarder. Le NET est
          la réponse ; entrées et sorties sont ce qui le compose, donc en
          appui. Le rouge est réservé au net négatif — le seul cas où il y a
          quelque chose à faire. */}
      <section className="mt-6 rounded-xl border border-line bg-paper p-5 sm:p-6">
        <p className="text-sm text-ink-soft">{t.net}</p>
        <p className={`mt-1 font-display text-3xl font-extrabold tabular-nums sm:text-4xl ${net < 0 ? "text-err" : "text-ink"}`}>
          {net < 0 ? "−" : ""}
          {formatFcfa(net, locale)}
        </p>
        <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 border-t border-line-soft pt-4 text-sm">
          <div className="flex items-baseline gap-2">
            <dt className="text-ink-soft">{t.totalIn}</dt>
            <dd className="font-semibold tabular-nums text-ink">+{formatFcfa(totalIn, locale)}</dd>
          </div>
          <div className="flex items-baseline gap-2">
            <dt className="text-ink-soft">{t.totalOut}</dt>
            <dd className="font-semibold tabular-nums text-ink">−{formatFcfa(totalOut, locale)}</dd>
          </div>
        </dl>
      </section>

      {visible.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-line-soft bg-paper p-10 text-center">
          <p className="font-display text-lg font-bold text-ink">{t.empty}</p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-ink-soft">{t.description}</p>
        </div>
      ) : (
      <div className="mt-6 overflow-hidden rounded-xl border border-line bg-paper">
        {/* Sous md, une liste de cartes : la table faisait 640 px de large
            minimum et défilait latéralement — sur un téléphone, on perdait la
            date en faisant apparaître le montant. */}
        <ul role="list" className="divide-y divide-line-soft md:hidden">
          {visible.map((e) => (
            <li key={`m-${e.category}-${e.id}`} className="p-4">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 font-medium text-ink">{e.label}</span>
                <span className={`shrink-0 font-semibold tabular-nums ${e.amountCents < 0 ? "text-err" : "text-ink"}`}>
                  {e.amountCents < 0 ? "−" : "+"}
                  {formatFcfa(e.amountCents, locale)}
                </span>
              </div>
              <p className="mt-1 text-xs text-ink-soft">
                {t.categories[e.category]} · {formatDate(e.date, locale)}
                {e.note ? ` · ${e.note}` : ""}
              </p>
            </li>
          ))}
        </ul>

        <table className="hidden w-full text-left text-sm md:table">
          <thead className="border-b border-line-soft bg-clay text-ink-soft">
            <tr>
              <th className="px-4 py-3 font-medium">{t.date}</th>
              <th className="px-4 py-3 font-medium">{t.category}</th>
              <th className="px-4 py-3 font-medium">{t.detail}</th>
              <th className="px-4 py-3 text-right font-medium">{t.amount}</th>
              <th className="px-4 py-3 font-medium">{t.note}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-soft">
            {visible.map((e) => (
              <tr key={`${e.category}-${e.id}`} className="hover:bg-clay">
                <td className="whitespace-nowrap px-4 py-3 text-ink-soft">{formatDate(e.date, locale)}</td>
                <td className="px-4 py-3">
                  {/* Pastille NEUTRE : la catégorie est un classement, pas une
                      alerte. Trois couleurs de pastille plus deux de montant
                      faisaient quatre signaux par ligne, donc aucun. */}
                  <span className="rounded-full bg-clay px-2.5 py-1 text-xs font-medium text-ink-soft">
                    {t.categories[e.category]}
                  </span>
                </td>
                <td className="px-4 py-3 text-ink">{e.label}</td>
                <td
                  className={`whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums ${
                    e.amountCents < 0 ? "text-err" : "text-ink"
                  }`}
                >
                  {e.amountCents < 0 ? "−" : "+"}
                  {formatFcfa(e.amountCents, locale)}
                </td>
                <td className="px-4 py-3 text-ink-soft">{e.note ?? "—"}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-line bg-clay">
            <tr className="font-semibold text-ink">
              <td className="px-4 py-3" colSpan={3}>
                {t.net}
              </td>
              <td className={`px-4 py-3 text-right tabular-nums ${net < 0 ? "text-err" : "text-ink"}`}>
                {net < 0 ? "−" : ""}
                {formatFcfa(net, locale)}
              </td>
              <td className="px-4 py-3" />
            </tr>
          </tfoot>
        </table>
        {entries.length > visible.length && (
          <p className="border-t border-line-soft px-4 py-3 text-xs text-ink-soft">
            {t.display(visible.length, entries.length)}
          </p>
        )}
      </div>
      )}
    </div>
  );
}
