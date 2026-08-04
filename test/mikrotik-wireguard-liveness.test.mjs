import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("WireGuard peers allocated on the relay keep the NAT mapping alive from both ends", async () => {
  const source = await read("../src/lib/mikrotik/relay.ts");

  assert.match(
    source,
    /wg set wg0 peer "\$PEER_PUB" allowed-ips "\$PEER_IP" persistent-keepalive 25/,
  );
});

test("a fresh WireGuard handshake prevents a healthy tunnel from being labelled offline", async () => {
  const [relay, sync] = await Promise.all([
    read("../src/lib/mikrotik/relay.ts"),
    read("../src/lib/mikrotik/router-sync.ts"),
  ]);

  assert.match(relay, /export async function getWireGuardPeerLatestHandshake/);
  assert.match(relay, /export function hasFreshWireGuardHandshake/);
  assert.match(sync, /getWireGuardPeerLatestHandshake/);
  assert.match(sync, /hasFreshWireGuardHandshake/);
  assert.match(sync, /status: "online"/);
});
