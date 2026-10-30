import assert from "node:assert/strict";
import { test } from "node:test";
import { inferVoucherDuration, buildCustomDurationCode, voucherCodePrefix } from "./voucher-profiles";

test("voucherCodePrefix : préfixe lisible par durée (portail)", () => {
  // Exemples de la demande : 1j / 4j / 5j / 2s / 1m.
  assert.equal(voucherCodePrefix(1, "d"), "1j");
  assert.equal(voucherCodePrefix(4, "d"), "4j");
  assert.equal(voucherCodePrefix(2, "w"), "2s");
  assert.equal(voucherCodePrefix(1, "mo"), "1m");
  assert.equal(voucherCodePrefix(3, "h"), "3h");
  // « m » est réservé au mois : la minute prend "mn" (pas de collision avec 1m).
  assert.equal(voucherCodePrefix(5, "m"), "5mn");
  assert.notEqual(voucherCodePrefix(1, "m"), voucherCodePrefix(1, "mo"));
});

test("profil → préfixe de code (bout en bout)", () => {
  const prefixOf = (name: string) => {
    const d = inferVoucherDuration(name)!;
    return voucherCodePrefix(d.amount, d.unit);
  };
  assert.equal(prefixOf("01-JOUR"), "1j");
  assert.equal(prefixOf("02-SEMAINES"), "2s");
  assert.equal(prefixOf("01-MOIS"), "1m");
});

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
