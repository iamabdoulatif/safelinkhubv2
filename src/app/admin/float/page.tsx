import { eq, desc } from "drizzle-orm";
import { Droplet } from "lucide-react";
import { getDb } from "@/lib/db";
import { floatTransactions } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import FloatTransactionModal from "./FloatTransactionModal";

function formatFcfa(cents: number) {
  return `FCFA ${cents.toLocaleString("en-US")}`;
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default async function FloatPage() {
  const session = await getSession();
  const db = getDb();

  const transactions = session
    ? await db
        .select()
        .from(floatTransactions)
        .where(eq(floatTransactions.orgId, session.orgId))
        .orderBy(desc(floatTransactions.createdAt))
    : [];

  const balanceCents = transactions.reduce(
    (sum, t) => sum + (t.type === "deposit" ? t.amountCents : -t.amountCents),
    0,
  );

  return (
    <div className="mx-auto max-w-4xl animate-fade-in-up">
      <div className="flex items-center gap-2">
        <Droplet className="h-5 w-5 text-slate-700" />
        <h1 className="text-2xl font-bold text-slate-900">Solde flottant</h1>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Suivez la liquidité disponible pour payer les commissions et gérer
        les opérations courantes.
      </p>

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 hover-lift">
        <p className="text-sm font-medium text-slate-500">Solde actuel</p>
        <p
          className={`mt-1 text-3xl font-bold ${
            balanceCents < 0 ? "text-red-600" : "text-slate-900"
          }`}
        >
          {formatFcfa(balanceCents)}
        </p>

        <div className="mt-4 flex gap-2">
          <FloatTransactionModal type="deposit" />
          <FloatTransactionModal type="withdrawal" />
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="table-mobile-wrapper">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Montant</th>
              <th className="px-4 py-3 font-medium">Note</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {transactions.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                  Aucune transaction pour le moment.
                </td>
              </tr>
            )}
            {transactions.map((t) => (
              <tr key={t.id}>
                <td className="px-4 py-3 text-slate-600">
                  {formatDate(t.createdAt)}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      t.type === "deposit"
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-amber-50 text-amber-700"
                    }`}
                  >
                    {t.type === "deposit" ? "Dépôt" : "Retrait"}
                  </span>
                </td>
                <td
                  className={`px-4 py-3 font-medium ${
                    t.type === "deposit" ? "text-emerald-700" : "text-amber-700"
                  }`}
                >
                  {t.type === "deposit" ? "+" : "-"}
                  {formatFcfa(t.amountCents)}
                </td>
                <td className="px-4 py-3 text-slate-500">{t.note ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
