import test from "node:test";
import assert from "node:assert/strict";
import { canDebit, computeLedgerBalance, signedAmount } from "./ledger";

test("calcule un solde à partir des écritures confirmées", () => {
  assert.equal(
    computeLedgerBalance([
      { amountScCents: 500, status: "completed" },
      { amountScCents: -130, status: "completed" },
      { amountScCents: 300, status: "pending" },
    ]),
    370,
  );
});

test("un débit ne peut pas dépasser le solde", () => {
  assert.equal(canDebit(500, 500), true);
  assert.equal(canDebit(499, 500), false);
});

test("les débits sont stockés en montant négatif", () => {
  assert.equal(signedAmount("credit", 500), 500);
  assert.equal(signedAmount("debit", 500), -500);
});
