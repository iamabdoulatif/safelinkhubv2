import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  SHARDS,
  shardForIndex,
  isShard,
  shardingEnabled,
  portRangeForShard,
  LEGACY_PORT_RANGE,
} from "./shards";

const original = process.env.RELAY_BASE_DOMAIN;
afterEach(() => {
  if (original === undefined) delete process.env.RELAY_BASE_DOMAIN;
  else process.env.RELAY_BASE_DOMAIN = original;
});

describe("relay shards", () => {
  it("assigns shards round-robin over s1..s4", () => {
    assert.deepEqual(
      [0, 1, 2, 3, 4, 5].map(shardForIndex),
      ["s1", "s2", "s3", "s4", "s1", "s2"],
    );
  });

  it("recognises valid shard names only", () => {
    for (const s of SHARDS) assert.equal(isShard(s), true);
    assert.equal(isShard("s5"), false);
    assert.equal(isShard(null), false);
    assert.equal(isShard(undefined), false);
  });

  it("gates on RELAY_BASE_DOMAIN", () => {
    delete process.env.RELAY_BASE_DOMAIN;
    assert.equal(shardingEnabled(), false);
    process.env.RELAY_BASE_DOMAIN = "safelinkhub.io";
    assert.equal(shardingEnabled(), true);
  });

  it("uses the legacy pool when disabled, per-shard ranges when enabled", () => {
    delete process.env.RELAY_BASE_DOMAIN;
    assert.deepEqual(portRangeForShard("s3"), LEGACY_PORT_RANGE);

    process.env.RELAY_BASE_DOMAIN = "safelinkhub.io";
    assert.deepEqual(portRangeForShard("s1"), [30000, 59999]);
    assert.deepEqual(portRangeForShard("s3"), [90000, 119999]);
    // Unknown shard falls back to the legacy pool even when enabled.
    assert.deepEqual(portRangeForShard(null), LEGACY_PORT_RANGE);
  });
});
