import { eq, desc } from "drizzle-orm";
import { Receipt } from "lucide-react";
import { getDb } from "@/lib/db";
import { expenses } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import AddExpenseModal from "./AddExpenseModal";
import DeleteExpenseButton from "./DeleteExpenseButton";
import { getAdminDict } from "@/lib/i18n/admin";
import { getLocale } from "@/lib/i18n/server";
import type { AdminDictionary } from "@/lib/i18n/admin";

const expenseCategoryKeys = {
  "Internet / Bande passante": "bandwidth",
  Électricité: "electricity",
  Équipement: "equipment",
  Loyer: "rent",
  Salaires: "salaries",
  Maintenance: "maintenance",
  Autre: "other",
} as const;

function formatFcfa(cents: number, locale: string) {
  return `FCFA ${cents.toLocaleString(locale)}`;
}

function formatDate(date: Date, locale: string) {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date);
}

function isSameMonth(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function displayExpenseCategory(
  category: string,
  labels: AdminDictionary["finance"]["expenses"]["categories"],
) {
  const key = expenseCategoryKeys[category as keyof typeof expenseCategoryKeys];
  return key ? labels[key] : category;
}

export default async function ExpensesPage() {
  const [session, locale, dict] = await Promise.all([getSession(), getLocale(), getAdminDict()]);
  const t = dict.finance.expenses;
  const db = getDb();

  const orgExpenses = session
    ? await db
        .select()
        .from(expenses)
        .where(eq(expenses.orgId, session.orgId))
        .orderBy(desc(expenses.expenseDate))
    : [];

  const now = new Date();
  const totalCents = orgExpenses.reduce((sum, e) => sum + e.amountCents, 0);
  const monthCents = orgExpenses
    .filter((e) => isSameMonth(e.expenseDate, now))
    .reduce((sum, e) => sum + e.amountCents, 0);

  return (
    <div className="mx-auto max-w-4xl animate-fade-in-up">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Receipt className="h-5 w-5 text-ink" />
          <h1 className="text-2xl font-bold text-ink">{t.title}</h1>
        </div>
        <AddExpenseModal t={{ ...t.modal, categories: t.categories }} />
      </div>
      <p className="mt-1 text-sm text-ink-soft">
        {t.description}
      </p>

      {/* Deux cartes jumelles ne disaient pas laquelle regarder. Le cumul
          porte la page ; le mois en cours est ce qui le fait bouger. */}
      <section className="mt-6 rounded-xl border border-line bg-paper p-5 sm:p-6">
        <p className="text-sm text-ink-soft">{t.total}</p>
        <p className="mt-1 font-display text-3xl font-extrabold tabular-nums text-ink sm:text-4xl">
          {formatFcfa(totalCents, locale)}
        </p>
        <p className="mt-4 border-t border-line-soft pt-4 text-sm text-ink-soft">
          {t.thisMonth}{" "}
          <span className="font-semibold tabular-nums text-ink">{formatFcfa(monthCents, locale)}</span>
        </p>
      </section>

      {orgExpenses.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-line-soft bg-paper p-10 text-center">
          <p className="font-display text-lg font-bold text-ink">{t.empty}</p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-ink-soft">{t.description}</p>
        </div>
      ) : (
      <div className="mt-6 overflow-hidden rounded-xl border border-line bg-paper">
        {/* Cartes sous md : la table imposait 640 px et un défilement latéral,
            qui séparait le montant de sa date. */}
        <ul role="list" className="divide-y divide-line-soft md:hidden">
          {orgExpenses.map((e) => (
            <li key={`m-${e.id}`} className="flex items-start justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="font-medium text-ink">{displayExpenseCategory(e.category, t.categories)}</p>
                <p className="mt-1 text-xs text-ink-soft">
                  {formatDate(e.expenseDate, locale)}
                  {e.note ? ` · ${e.note}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="font-semibold tabular-nums text-ink">
                  −{formatFcfa(e.amountCents, locale)}
                </span>
                <DeleteExpenseButton expenseId={e.id} title={t.modal.delete} />
              </div>
            </li>
          ))}
        </ul>

        <table className="hidden w-full text-left text-sm md:table">
          <thead className="border-b border-line-soft bg-clay text-ink-soft">
            <tr>
              <th className="px-4 py-3 font-medium">{t.date}</th>
              <th className="px-4 py-3 font-medium">{t.category}</th>
              <th className="px-4 py-3 text-right font-medium">{t.amount}</th>
              <th className="px-4 py-3 font-medium">{t.note}</th>
              <th className="w-10 px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line-soft">
            {orgExpenses.map((e) => (
              <tr key={e.id} className="hover:bg-clay">
                <td className="whitespace-nowrap px-4 py-3 text-ink-soft">
                  {formatDate(e.expenseDate, locale)}
                </td>
                <td className="px-4 py-3 text-ink">{displayExpenseCategory(e.category, t.categories)}</td>
                {/* Une page de dépenses n'affiche que des sorties : les peindre
                    toutes en rouge ne distingue rien. Le signe suffit. */}
                <td className="whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums text-ink">
                  −{formatFcfa(e.amountCents, locale)}
                </td>
                <td className="px-4 py-3 text-ink-soft">{e.note ?? t.noNote}</td>
                <td className="px-4 py-3">
                  <DeleteExpenseButton expenseId={e.id} title={t.modal.delete} />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-line bg-clay">
            <tr className="font-semibold text-ink">
              <td className="px-4 py-3" colSpan={2}>{t.total}</td>
              <td className="px-4 py-3 text-right tabular-nums">−{formatFcfa(totalCents, locale)}</td>
              <td className="px-4 py-3" colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
      )}
    </div>
  );
}
