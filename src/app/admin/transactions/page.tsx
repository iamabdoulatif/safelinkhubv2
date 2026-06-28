import { eq } from "drizzle-orm";
import { ArrowLeftRight } from "lucide-react";
import { getDb } from "@/lib/db";
import { floatTransactions, expenses, vouchers, packages } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";

function formatFcfa(cents: number) {
  return `FCFA ${Math.abs(cents).toLocaleString("en-US")}`;
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

type LedgerEntry = {
  id: string;
  date: Date;
  label: string;
  category: "Dépôt" | "Retrait" | "Dépense" | "Vente";
  amountCents: number; // positive = in, negative = out
  note: string | null;
};

/**
 * Unlike Solde flottant / Dépenses / Ventes (each scoped to one source),
 * this is the single combined audit trail across all three — every cash
 * movement an admin would need to reconcile in one place.
 */
export default async function TransactionsPage() {
  const session = await getSession();
  const db = getDb();

  if (!session) {
    return (
      <div className="mx-auto max-w-5xl">
        <h1 className="text-2xl font-bold text-slate-900">Transactions</h1>
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
    ...floatRows.map((t) => ({
      id: t.id,
      date: t.createdAt,
      label: t.type === "deposit" ? "Dépôt flottant" : "Retrait flottant",
      category: (t.type === "deposit" ? "Dépôt" : "Retrait") as LedgerEntry["category"],
      amountCents: t.type === "deposit" ? t.amountCents : -t.amountCents,
      note: t.note,
    })),
    ...expenseRows.map((e) => ({
      id: e.id,
      date: e.expenseDate,
      label: e.category,
      category: "Dépense" as const,
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
          label: `Vente — ${pkg.name} (${v.username})`,
          category: "Vente" as const,
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
    Dépôt: "bg-emerald-50 text-emerald-700",
    Vente: "bg-emerald-50 text-emerald-700",
    Retrait: "bg-amber-50 text-amber-700",
    Dépense: "bg-red-50 text-red-700",
  };

  return (
    <div className="mx-auto max-w-5xl animate-fade-in-up">
      <div className="flex items-center gap-2">
        <ArrowLeftRight className="h-5 w-5 text-slate-700" />
        <h1 className="text-2xl font-bold text-slate-900">Transactions</h1>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Journal combiné de tous les mouvements financiers — dépôts/retraits du solde
        flottant, dépenses et ventes de vouchers.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5 hover-lift">
          <p className="text-sm font-medium text-slate-500">Total entrées</p>
          <p className="mt-1 text-2xl font-bold text-emerald-700">{formatFcfa(totalIn)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 hover-lift">
          <p className="text-sm font-medium text-slate-500">Total sorties</p>
          <p className="mt-1 text-2xl font-bold text-red-600">{formatFcfa(totalOut)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 hover-lift">
          <p className="text-sm font-medium text-slate-500">Net</p>
          <p className={`mt-1 text-2xl font-bold ${net < 0 ? "text-red-600" : "text-slate-900"}`}>
            {net < 0 ? "-" : ""}
            {formatFcfa(net)}
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
              <th className="px-4 py-3 font-medium">Détail</th>
              <th className="px-4 py-3 font-medium">Montant</th>
              <th className="px-4 py-3 font-medium">Note</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visible.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  Aucune transaction pour le moment.
                </td>
              </tr>
            )}
            {visible.map((e) => (
              <tr key={`${e.category}-${e.id}`}>
                <td className="px-4 py-3 text-slate-600">{formatDate(e.date)}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${categoryStyle[e.category]}`}>
                    {e.category}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-700">{e.label}</td>
                <td
                  className={`px-4 py-3 font-medium ${
                    e.amountCents < 0 ? "text-red-600" : "text-emerald-700"
                  }`}
                >
                  {e.amountCents < 0 ? "-" : "+"}
                  {formatFcfa(e.amountCents)}
                </td>
                <td className="px-4 py-3 text-slate-500">{e.note ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        {entries.length > visible.length && (
          <p className="border-t border-slate-100 px-4 py-3 text-xs text-slate-400">
            Affichage des {visible.length} transactions les plus récentes sur {entries.length}.
          </p>
        )}
      </div>
    </div>
  );
}
