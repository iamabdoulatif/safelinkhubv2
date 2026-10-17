import assert from "node:assert/strict";
import { test } from "node:test";
import { buildFupEnforcement } from "./starlink-fup-enforcement";
import { suggestedStarlinkLinks } from "./starlink-fup-presets";
import type { FupLedger } from "./starlink-fup";

const links = suggestedStarlinkLinks("0c1fea72-50fb-4593-a740-ea2a3fe49c5f");
const at = new Date("2026-10-17T12:00:00Z");
const ledger: Record<string, FupLedger> = Object.fromEntries(links.map((link, i) => [link.id, {
  cycleStart: link.cycleStart, cycleEnd: link.cycleEnd, at: at.toISOString(),
  rawBytes: 1000000, cycleUsedBytes: (i ? 2130 : 4800) * 1e9, baselineConfirmed: true, uptimeSeconds: 3600,
}]));
test("conservative shared cap covers the weakest remaining link and reserve PCQ", () => {
  const plan = buildFupEnforcement(links, ledger, at);
  assert.equal(plan.stop, false);
  assert.equal(plan.reserve, true);
  const safeBps = Math.floor((200e9 * 8 / (3.5 * 86400)) * 0.95);
  assert.ok(plan.totalBps <= safeBps && safeBps - plan.totalBps <= 1);
  assert.match(plan.script, /20261021/);
  assert.match(plan.script, /20261110/);
  assert.match(plan.bootScript, /slh-fup-stop-/);
  assert.equal(plan.script.match(/disabled=yes/g)?.length, 1); // FastTrack only
  assert.doesNotMatch(plan.script, /slhFupReady/);
  assert.match(plan.script, /199000000000/);
  assert.doesNotMatch(plan.script, /:set.*[Bb]ase|month/);
});
test("exhaustion stops Internet forwarding rather than creating an unlimited zero queue", () => {
  const exhausted = { ...ledger, [links[0].id]: { ...ledger[links[0].id], cycleUsedBytes: 5000e9 } };
  const plan = buildFupEnforcement(links, exhausted, at);
  assert.equal(plan.stop, true);
  assert.equal(plan.totalBps, 0);
  assert.match(plan.script, /:set safe false/);
});
test("unconfirmed, reset, stale, missing raw or malformed input cannot enable enforcement", () => {
  assert.throws(() => buildFupEnforcement(links, {}, at));
  assert.throws(() => buildFupEnforcement(links, ledger, new Date(at.getTime() + 600000)));
  assert.throws(() => buildFupEnforcement([{ ...links[0], interface: 'bad"interface' }], ledger, at));
});
