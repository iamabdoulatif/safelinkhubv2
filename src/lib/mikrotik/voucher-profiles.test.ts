import assert from "node:assert/strict";
import { test } from "node:test";
import { inferVoucherDuration, buildCustomDurationCode } from "./voucher-profiles";

test("inferVoucherDuration : noms MikHmon / SafeLinkHub → durée", () => {
  assert.deepEqual(inferVoucherDuration("1MOIS"), { amount: 1, unit: "mo" });
  assert.deepEqual(inferVoucherDuration("01-MOIS"), { amount: 1, unit: "mo" });
  assert.deepEqual(inferVoucherDuration("2SEMAINES"), { amount: 2, unit: "w" });
  assert.deepEqual(inferVoucherDuration("01-SEMAINE"), { amount: 1, unit: "w" });
  assert.deepEqual(inferVoucherDuration("5JOURS"), { amount: 5, unit: "d" });
  assert.deepEqual(inferVoucherDuration("01-JOUR"), { amount: 1, unit: "d" });
  assert.deepEqual(inferVoucherDuration("3HEURES"), { amount: 3, unit: "h" });
  assert.deepEqual(inferVoucherDuration("1H"), { amount: 1, unit: "h" });
  assert.deepEqual(inferVoucherDuration("30MIN"), { amount: 30, unit: "m" });
  assert.deepEqual(inferVoucherDuration("05-MINS"), { amount: 5, unit: "m" });
});

test("inferVoucherDuration : noms non interprétables → null", () => {
  assert.equal(inferVoucherDuration("default"), null);
  assert.equal(inferVoucherDuration("VIP"), null);
  assert.equal(inferVoucherDuration("ILLIMITE"), null);
  assert.equal(inferVoucherDuration("*5"), null);
});

test("durée déduite → code RouterOS cohérent", () => {
  const mois = inferVoucherDuration("1MOIS")!;
  assert.equal(buildCustomDurationCode(mois.amount, mois.unit), "30d");
  const sem = inferVoucherDuration("2SEMAINES")!;
  assert.equal(buildCustomDurationCode(sem.amount, sem.unit), "14d");
});
