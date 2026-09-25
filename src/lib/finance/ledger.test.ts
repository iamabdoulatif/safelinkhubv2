import assert from "node:assert/strict";
import test from "node:test";
import { buildLedger, ledgerCsv, summarizeLedger } from "./ledger";

const labels = { floatDeposit: "Dépôt", floatWithdrawal: "Retrait", saleDetail: (p: string, c: string) => `Vente ${p} (${c})` };
const d = (day: number) => new Date(2026, 8, day, 12);

const entries = buildLedger(
  {
    floats: [
      { id: "f1", type: "deposit", amountCents: 5000, note: null, createdAt: d(1) },
      { id: "f2", type: "withdrawal", amountCents: 2000, note: "banque", createdAt: d(3) },
    ],
    expenses: [{ id: "e1", category: "Électricité", amountCents: 1500, note: null, expenseDate: d(2) }],
    sales: [{ id: "s1", username: "k7m", packageName: "1 jour", priceCents: 200, createdAt: d(4) }],
  },
  labels,
);

test("le journal est trié du plus récent au plus ancien, sorties négatives", () => {
  assert.deepEqual(entries.map((e) => [e.id, e.amountCents]), [["s1", 200], ["f2", -2000], ["e1", -1500], ["f1", 5000]]);
  assert.equal(entries[0].label, "Vente 1 jour (k7m)");
});

test("entrées, sorties et net ; détail par catégorie", () => {
  const s = summarizeLedger(entries);
  assert.equal(s.inCents, 5200);
  assert.equal(s.outCents, 3500);
  assert.equal(s.netCents, 1700);
  assert.deepEqual(s.byCategory.expense, { count: 1, totalCents: -1500 });
  assert.deepEqual(s.byCategory.sale, { count: 1, totalCents: 200 });
});

test("les ventes ne viennent QUE des commandes payées", async () => {
  const { readFile } = await import("node:fs/promises");
  const page = await readFile(new URL("../../app/admin/transactions/page.tsx", import.meta.url), "utf8");
  assert.match(page, /getPaidSales\(/);
  assert.doesNotMatch(page, /from\(vouchers\)/, "un ticket généré ou importé n'est pas une vente encaissée");
});

test("le CSV signe les montants et échappe les séparateurs", () => {
  const csv = ledgerCsv(entries, (c) => c);
  assert.match(csv, /;withdrawal;Retrait;-2000;banque$/m);
});
