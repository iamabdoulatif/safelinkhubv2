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

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="border border-line bg-paper p-5 hover-lift rounded-xl">
          <p className="text-sm font-medium text-ink-soft">{t.total}</p>
          <p className="mt-1 text-2xl font-bold text-ink">
            {formatFcfa(totalCents, locale)}
          </p>
        </div>
        <div className="border border-line bg-paper p-5 hover-lift rounded-xl">
          <p className="text-sm font-medium text-ink-soft">{t.thisMonth}</p>
          <p className="mt-1 text-2xl font-bold text-ink">
            {formatFcfa(monthCents, locale)}
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
              <th className="px-4 py-3 font-medium">{t.amount}</th>
              <th className="px-4 py-3 font-medium">{t.note}</th>
              <th className="w-10 px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line-soft">
            {orgExpenses.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-ink-soft">
                  {t.empty}
                </td>
              </tr>
            )}
            {orgExpenses.map((e) => (
              <tr key={e.id}>
                <td className="px-4 py-3 text-ink-soft">
                  {formatDate(e.expenseDate, locale)}
                </td>
                <td className="px-4 py-3 text-ink">{displayExpenseCategory(e.category, t.categories)}</td>
                <td className="px-4 py-3 font-medium text-err">
                  -{formatFcfa(e.amountCents, locale)}
                </td>
                <td className="px-4 py-3 text-ink-soft">{e.note ?? t.noNote}</td>
                <td className="px-4 py-3">
                  <DeleteExpenseButton expenseId={e.id} title={t.modal.delete} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
