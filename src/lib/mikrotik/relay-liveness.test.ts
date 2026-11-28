import assert from "node:assert/strict";
import test from "node:test";
import { hasFreshWireGuardHandshake, WIREGUARD_HANDSHAKE_FRESH_MS } from "./relay";

test("un handshake WireGuard de cinq minutes protège encore un tunnel sain", () => {
  const now = 1_800_000_000_000;
  assert.equal(hasFreshWireGuardHandshake(now - WIREGUARD_HANDSHAKE_FRESH_MS, now), true);
  assert.equal(hasFreshWireGuardHandshake(now - WIREGUARD_HANDSHAKE_FRESH_MS - 1, now), false);
});

test("un handshake absent ou futur ne rend jamais un routeur sain", () => {
  const now = 1_800_000_000_000;
  assert.equal(hasFreshWireGuardHandshake(null, now), false);
  assert.equal(hasFreshWireGuardHandshake(now + 1, now), false);
});
