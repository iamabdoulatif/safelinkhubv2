import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { remoteAccessPriceFcfa } from "./remote-access-gate-config";

describe("tarifs MikHmon Online", () => {
  it("applique 500 FCFA par mois sans changer les autres accès", () => {
    assert.equal(remoteAccessPriceFcfa("mikhmon", "monthly"), 500);
    assert.equal(remoteAccessPriceFcfa("mikhmon", "quarterly"), 1500);
    assert.equal(remoteAccessPriceFcfa("mikhmon", "semiannual"), 3000);
    assert.equal(remoteAccessPriceFcfa("mikhmon", "yearly"), 6000);
    assert.equal(remoteAccessPriceFcfa("winbox", "quarterly"), 1300);
  });
});
