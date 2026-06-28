import { eq, desc } from "drizzle-orm";
import { Receipt } from "lucide-react";
import { getDb } from "@/lib/db";
import { expenses } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import AddExpenseModal from "./AddExpenseModal";
import DeleteExpenseButton from "./DeleteExpenseButton";

function formatFcfa(cents: number) {
  return `FCFA ${cents.toLocaleString("en-US")}`;
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(date);
}

function isSameMonth(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

export default async function ExpensesPage() {
  const session = await getSession();
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
          <Receipt className="h-5 w-5 text-slate-700" />
          <h1 className="text-2xl font-bold text-slate-900">Dépenses</h1>
        </div>
        <AddExpenseModal />
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Suivez les coûts d&apos;exploitation (bande passante, électricité,
        équipement, etc.).
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5 hover-lift">
          <p className="text-sm font-medium text-slate-500">Total des dépenses</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">
            {formatFcfa(totalCents)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 hover-lift">
          <p className="text-sm font-medium text-slate-500">Ce mois-ci</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">
            {formatFcfa(monthCents)}
          </p>
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="table-mobile-wrapper">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Catégorie</th>
              <th className="px-4 py-3 font-medium">Montant</th>
              <th className="px-4 py-3 font-medium">Note</th>
              <th className="w-10 px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {orgExpenses.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  Aucune dépense pour le moment.
                </td>
              </tr>
            )}
            {orgExpenses.map((e) => (
              <tr key={e.id}>
                <td className="px-4 py-3 text-slate-600">
                  {formatDate(e.expenseDate)}
                </td>
                <td className="px-4 py-3 text-slate-900">{e.category}</td>
                <td className="px-4 py-3 font-medium text-red-600">
                  -{formatFcfa(e.amountCents)}
                </td>
                <td className="px-4 py-3 text-slate-500">{e.note ?? "—"}</td>
                <td className="px-4 py-3">
                  <DeleteExpenseButton expenseId={e.id} />
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
