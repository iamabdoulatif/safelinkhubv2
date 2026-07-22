import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  WALLET_PAYMENT_METHODS,
  getWalletPaymentMethodLabel,
  getWalletEligibleCountries,
  isWalletPaymentMethod,
} from "./payment-options";

describe("options de paiement du portefeuille", () => {
  it("expose les rails mobiles et carte acceptés par Genius Pay", () => {
    assert.deepEqual(
      WALLET_PAYMENT_METHODS.map((method) => method.id),
      ["wave", "orange_money", "mtn_money", "moov_money", "card"],
    );
    assert.equal(isWalletPaymentMethod("wave"), true);
    assert.equal(isWalletPaymentMethod("bitcoin"), false);
    assert.equal(getWalletPaymentMethodLabel("orange_money"), "Orange Money");
  });

  it("ne propose que les pays africains nommés comme éligibles", () => {
    const countries = getWalletEligibleCountries();
    assert.ok(countries.length > 20);
    assert.equal(countries.some((country) => country.iso2 === "CI"), true);
    assert.equal(countries.some((country) => country.iso2 === "XX"), false);
    assert.equal(new Set(countries.map((country) => country.iso2)).size, countries.length);
  });
});
