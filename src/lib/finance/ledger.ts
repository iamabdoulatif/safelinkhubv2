export type LedgerCategory = "sale" | "deposit" | "withdrawal" | "expense";
export const LEDGER_CATEGORIES: LedgerCategory[] = ["sale", "deposit", "withdrawal", "expense"];

export type LedgerEntry = {
  id: string;
  date: Date;
  label: string;
  category: LedgerCategory;
  /** Positif = entrée, négatif = sortie. FCFA entiers. */
  amountCents: number;
  note: string | null;
};

/**
 * Journal combiné : solde flottant, dépenses et VENTES ENCAISSÉES.
 *
 * Les ventes viennent des commandes payées (getPaidSales), comme la page
 * Ventes. Avant, chaque TICKET doté d'un forfait comptait comme une vente au
 * prix du forfait — lots générés et tickets importés compris : « Total
 * entrées » et « Net » affichaient de l'argent jamais encaissé.
 */
export function buildLedger(
  input: {
    floats: { id: string; type: string; amountCents: number; note: string | null; createdAt: Date }[];
    expenses: { id: string; category: string; amountCents: number; note: string | null; expenseDate: Date }[];
    sales: { id: string; username: string; packageName: string; priceCents: number; createdAt: Date }[];
  },
  labels: { floatDeposit: string; floatWithdrawal: string; saleDetail: (pkg: string, code: string) => string },
): LedgerEntry[] {
  return [
    ...input.floats.map((f) => {
      const deposit = f.type === "deposit";
      return {
        id: f.id,
        date: f.createdAt,
        label: deposit ? labels.floatDeposit : labels.floatWithdrawal,
        category: (deposit ? "deposit" : "withdrawal") as LedgerCategory,
        amountCents: deposit ? f.amountCents : -f.amountCents,
        note: f.note,
      };
    }),
    ...input.expenses.map((e) => ({
      id: e.id,
      date: e.expenseDate,
      label: e.category,
      category: "expense" as const,
      amountCents: -e.amountCents,
      note: e.note,
    })),
    ...input.sales.map((s) => ({
      id: s.id,
      date: s.createdAt,
      label: labels.saleDetail(s.packageName, s.username),
      category: "sale" as const,
      amountCents: s.priceCents,
      note: null,
    })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime());
}

export function summarizeLedger(entries: LedgerEntry[]) {
  const byCategory = Object.fromEntries(
    LEDGER_CATEGORIES.map((c) => [c, { count: 0, totalCents: 0 }]),
  ) as Record<LedgerCategory, { count: number; totalCents: number }>;
  let inCents = 0;
  let outCents = 0;
  for (const e of entries) {
    if (e.amountCents >= 0) inCents += e.amountCents;
    else outCents += -e.amountCents;
    byCategory[e.category].count += 1;
    byCategory[e.category].totalCents += e.amountCents;
  }
  return { inCents, outCents, netCents: inCents - outCents, byCategory };
}

/** Export CSV (« ; » + montants signés) — Excel en français l'ouvre tel quel. */
export function ledgerCsv(entries: LedgerEntry[], categoryLabel: (c: LedgerCategory) => string): string {
  const cell = (v: string | number) => {
    const s = String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [
    ["Date", "Catégorie", "Détail", "Montant FCFA", "Note"].join(";"),
    ...entries.map((e) =>
      [e.date.toISOString(), categoryLabel(e.category), e.label, e.amountCents, e.note ?? ""].map(cell).join(";"),
    ),
  ].join("\n");
}
