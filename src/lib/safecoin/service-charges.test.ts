import test from "node:test";
import assert from "node:assert/strict";
import { autoSetupPriceScCents, vpnPriceScCents } from "./service-charges";

test("convertit les périodes VPN existantes", () => {
  assert.deepEqual(vpnPriceScCents(), {
    monthly: 500,
    quarterly: 1300,
    semiannual: 2700,
    yearly: 5800,
  });
});

test("convertit l'Auto-Setup avec ou sans conteneur", () => {
  assert.equal(autoSetupPriceScCents(true), 15000);
  assert.equal(autoSetupPriceScCents(false), 10000);
});
