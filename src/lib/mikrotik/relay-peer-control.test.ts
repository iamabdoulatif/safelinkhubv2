import test from "node:test";
import assert from "node:assert/strict";
import { isValidWireGuardAddress, isValidWireGuardPeerKey } from "./relay";

test("WireGuard peer validation accepts the relay format", () => {
  assert.equal(isValidWireGuardPeerKey("A".repeat(43) + "="), true);
  assert.equal(isValidWireGuardAddress("10.66.0.76/32"), true);
});

test("WireGuard peer validation rejects unsafe or foreign addresses", () => {
  assert.equal(isValidWireGuardPeerKey("not-a-key"), false);
  assert.equal(isValidWireGuardAddress("10.66.1.76/32"), false);
  assert.equal(isValidWireGuardAddress("10.66.0.1/32"), false);
});
