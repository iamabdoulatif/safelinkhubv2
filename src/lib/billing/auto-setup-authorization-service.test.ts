import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isAutoSetupContinuation } from "./auto-setup-authorization-service";

describe("porte Auto-Setup", () => {
  it("autorise la réparation d'un routeur déjà configuré sans consommer un second paiement", () => {
    assert.equal(isAutoSetupContinuation(null), false);
    assert.equal(isAutoSetupContinuation(undefined), false);
    assert.equal(isAutoSetupContinuation({ hotspotAddress: "10.5.50.1" }), true);
  });
});
