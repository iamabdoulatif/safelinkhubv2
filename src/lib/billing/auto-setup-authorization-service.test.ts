import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isPaidAutoSetupRetry } from "./auto-setup-authorization-service";

describe("porte Auto-Setup", () => {
  it("autorise les reprises seulement pour le compte qui a payé", () => {
    assert.equal(isPaidAutoSetupRetry("approved", "payer", "payer"), true);
    assert.equal(isPaidAutoSetupRetry("approved", "payer", "another-user"), false);
    assert.equal(isPaidAutoSetupRetry("pending", "payer", "payer"), false);
    assert.equal(isPaidAutoSetupRetry("approved", null, "payer"), false);
  });
});
