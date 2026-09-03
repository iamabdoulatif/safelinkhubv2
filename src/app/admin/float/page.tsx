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
        <Droplet className="h-5 w-5 text-ink" />
        <h1 className="text-2xl font-bold text-ink">Solde flottant</h1>
      </div>
      <p className="mt-1 text-sm text-ink-soft">
        Suivez la liquidité disponible pour payer les commissions et gérer
        les opérations courantes.
      </p>

      <div className="mt-6 border border-line bg-paper p-6 hover-lift rounded-xl">
        <p className="text-sm font-medium text-ink-soft">Solde actuel</p>
        <p
          className={`mt-1 text-3xl font-bold ${
            balanceCents < 0 ? "text-err" : "text-ink"
          }`}
        >
          {formatFcfa(balanceCents)}
        </p>

        <div className="mt-4 flex gap-2">
          <FloatTransactionModal type="deposit" />
          <FloatTransactionModal type="withdrawal" />
        </div>
      </div>

      {transactions.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-line-soft bg-paper p-10 text-center">
          <p className="font-display text-lg font-bold text-ink">Aucun mouvement pour l&apos;instant</p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-ink-soft">
            Enregistrez un dépôt quand vous approvisionnez la caisse, un retrait quand vous en
            sortez de l&apos;argent : le solde ci-dessus suivra tout seul.
          </p>
        </div>
      ) : (
      <div className="mt-6 overflow-hidden rounded-xl border border-line bg-paper">
        {/* Sous md, une liste de cartes plutôt qu'une table de 640 px qui
            défile latéralement : sur un téléphone, on perdait la date en
            faisant apparaître le montant. */}
        <ul role="list" className="divide-y divide-line-soft md:hidden">
          {transactions.map((t) => (
            <li key={`m-${t.id}`} className="p-4">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-medium text-ink">
                  {t.type === "deposit" ? "Dépôt" : "Retrait"}
                </span>
                <span className={`shrink-0 font-semibold tabular-nums ${t.type === "deposit" ? "text-ink" : "text-err"}`}>
                  {t.type === "deposit" ? "+" : "−"}
                  {formatFcfa(t.amountCents)}
                </span>
              </div>
              <p className="mt-1 text-xs text-ink-soft">
                {formatDate(t.createdAt)}
                {t.note ? ` · ${t.note}` : ""}
              </p>
            </li>
          ))}
        </ul>

        <table className="hidden w-full text-left text-sm md:table">
          <thead className="border-b border-line-soft bg-clay text-ink-soft">
            <tr>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 text-right font-medium">Montant</th>
              <th className="px-4 py-3 font-medium">Note</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-soft">
            {transactions.map((t) => (
              <tr key={t.id} className="hover:bg-clay">
                <td className="whitespace-nowrap px-4 py-3 text-ink-soft">{formatDate(t.createdAt)}</td>
                <td className="px-4 py-3">
                  {/* Pastille neutre : le type est déjà porté par le signe et
                      par la colonne. Le colorier en plus, c'est dire deux fois
                      la même chose — et user le rouge sur un retrait normal. */}
                  <span className="rounded-full bg-clay px-2.5 py-1 text-xs font-medium text-ink-soft">
                    {t.type === "deposit" ? "Dépôt" : "Retrait"}
                  </span>
                </td>
                <td className={`whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums ${t.type === "deposit" ? "text-ink" : "text-err"}`}>
                  {t.type === "deposit" ? "+" : "−"}
                  {formatFcfa(t.amountCents)}
                </td>
                <td className="px-4 py-3 text-ink-soft">{t.note ?? "—"}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-line bg-clay">
            <tr className="font-semibold text-ink">
              <td className="px-4 py-3" colSpan={2}>Solde</td>
              <td className={`px-4 py-3 text-right tabular-nums ${balanceCents < 0 ? "text-err" : "text-ink"}`}>
                {balanceCents < 0 ? "−" : ""}
                {formatFcfa(balanceCents)}
              </td>
              <td className="px-4 py-3" />
            </tr>
          </tfoot>
        </table>
      </div>
      )}
    </div>
  );
}
