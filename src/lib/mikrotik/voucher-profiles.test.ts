import assert from "node:assert/strict";
import { test } from "node:test";
import {
  inferVoucherDuration,
  buildCustomDurationCode,
  voucherCodePrefix,
  clampDevicesPerVoucher,
  profileTakesDevicesPerVoucher,
  buildVoucherProfile,
} from "./voucher-profiles";

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

test("clampDevicesPerVoucher : entier dans [1,100], défaut 1", () => {
  assert.equal(clampDevicesPerVoucher(4), 4);
  assert.equal(clampDevicesPerVoucher(1), 1);
  assert.equal(clampDevicesPerVoucher(0), 1);
  assert.equal(clampDevicesPerVoucher(-5), 1);
  assert.equal(clampDevicesPerVoucher(3.9), 3);
  assert.equal(clampDevicesPerVoucher(999), 100);
  assert.equal(clampDevicesPerVoucher(null), 1);
  assert.equal(clampDevicesPerVoucher(undefined), 1);
  assert.equal(clampDevicesPerVoucher(NaN), 1);
});

test("profileTakesDevicesPerVoucher : épargne système / voie de paiement / illimité", () => {
  assert.equal(profileTakesDevicesPerVoucher("01-SEMAINE"), true);
  assert.equal(profileTakesDevicesPerVoucher("4-PERS"), true);
  assert.equal(profileTakesDevicesPerVoucher("default"), false);
  assert.equal(profileTakesDevicesPerVoucher("default-trial"), false);
  assert.equal(profileTakesDevicesPerVoucher("slh-paiement"), false);
  assert.equal(profileTakesDevicesPerVoucher("ILLIMITE"), false);
});

test("buildVoucherProfile : sharedUsers posé si >1, omis sinon (profil par défaut intact)", () => {
  const multi = buildVoucherProfile({ name: "01-SEMAINE", label: "1 semaine", durationCode: "7d", price: 700, sharedUsers: 4 });
  assert.equal(multi.sharedUsers, 4);
  const solo = buildVoucherProfile({ name: "01-JOUR", label: "1 jour", durationCode: "1d", price: 200, sharedUsers: 1 });
  assert.equal(solo.sharedUsers, undefined);
  const none = buildVoucherProfile({ name: "01-JOUR", label: "1 jour", durationCode: "1d", price: 200 });
  assert.equal(none.sharedUsers, undefined);
});
