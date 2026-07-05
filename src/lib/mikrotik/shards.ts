// Relay sharding (s1–s4.safelinkhub.io) — see
// docs/superpowers/specs/2026-07-05-relay-sharding-cloud-mikhmon-design.md
//
// Plain module (no "use server") so it can be imported by both server-action
// files and the schema/UI without tripping the "only async functions" rule.
//
// GATING: sharding is OFF until the env var RELAY_BASE_DOMAIN is set. While
// off, getRelayPublicHost()/allocatePortForward() behave exactly as before
// (single WG_RELAY_PUBLIC_HOST, one 30000–30999 port pool) — so this code can
// ship before the relay actually lives on the sharded VPS. Phase 3 (relay
// cutover) sets RELAY_BASE_DOMAIN and the shard hostnames/ranges go live.

export const SHARDS = ["s1", "s2", "s3", "s4"] as const;
export type Shard = (typeof SHARDS)[number];

// Per-shard public TCP DNAT port ranges (30k each → ~120k total vs the old
// single 1000-port pool). Disjoint so a shard can later become its own
// physical machine without reallocation.
const SHARD_RANGES: Record<Shard, readonly [number, number]> = {
  s1: [30000, 59999],
  s2: [60000, 89999],
  s3: [90000, 119999],
  s4: [120000, 149999],
};

// Legacy pool used when sharding is disabled — unchanged from the original
// allocatePortForward behaviour.
export const LEGACY_PORT_RANGE: readonly [number, number] = [30000, 30999];

/** True once the relay is sharded (RELAY_BASE_DOMAIN configured). */
export function shardingEnabled(): boolean {
  return !!process.env.RELAY_BASE_DOMAIN;
}

export function isShard(value: string | null | undefined): value is Shard {
  return !!value && (SHARDS as readonly string[]).includes(value);
}

/** Round-robin shard for the Nth router (0-indexed) — stable, even spread. */
export function shardForIndex(index: number): Shard {
  return SHARDS[((index % SHARDS.length) + SHARDS.length) % SHARDS.length];
}

/** Public port range to allocate from for a router on the given shard. */
export function portRangeForShard(shard: string | null | undefined): readonly [number, number] {
  if (shardingEnabled() && isShard(shard)) return SHARD_RANGES[shard];
  return LEGACY_PORT_RANGE;
}
