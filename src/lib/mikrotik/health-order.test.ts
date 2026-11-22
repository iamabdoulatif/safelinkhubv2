import { test } from "node:test";
import assert from "node:assert/strict";
import { orderHealthCandidates } from "./health-order";
import { parseLatestHandshakes } from "./relay";

const now = Date.parse("2026-11-22T09:00:00Z");
const at = (min: number) => new Date(now - min * 60_000);
const K = (c: string) => c.repeat(43) + "=";

test("orderHealthCandidates : hors-ligne au tunnel frais d'abord, puis en ligne, puis le reste", () => {
  const rows = [
    { id: "a", name: "ONLINE-1", status: "online", lastSyncAt: at(3), wgPeerPublicKey: K("a") },
    { id: "b", name: "DEAD", status: "offline", lastSyncAt: at(200), wgPeerPublicKey: K("b") },
    { id: "c", name: "BENY", status: "offline", lastSyncAt: at(100), wgPeerPublicKey: K("c") },
    { id: "d", name: "ONLINE-2", status: "online", lastSyncAt: at(10), wgPeerPublicKey: K("d") },
    { id: "e", name: "NO-WG", status: "offline", lastSyncAt: at(50), wgPeerPublicKey: null },
  ];
  const hs = new Map([[K("c"), now - 60_000], [K("b"), now - 3 * 3600_000]]);
  assert.deepEqual(orderHealthCandidates(rows, hs, now).map((r) => r.name), ["BENY", "ONLINE-2", "ONLINE-1", "DEAD", "NO-WG"]);
});

test("parseLatestHandshakes : ignore les pairs jamais vus (0)", () => {
  const m = parseLatestHandshakes(`${K("a")}\t1795337000\n${K("b")}\t0\n`);
  assert.equal(m.get(K("a")), 1795337000_000);
  assert.equal(m.has(K("b")), false);
});
