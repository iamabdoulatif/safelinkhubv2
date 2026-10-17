import assert from "node:assert/strict";
import { test } from "node:test";
import { advanceFupLedger, calculateFupBudget, validateFupLinks, type FupLink } from "./starlink-fup";

const at = new Date("2026-10-17T12:00:00Z");
const link: FupLink = {
  id: "standard", name: "Standard", interface: "E1-WAN-FAI",
  quotaGB: 5000, reserveGB: 500,
  cycleStart: "2026-10-03T00:00:00Z", cycleEnd: "2026-11-03T00:00:00Z",
  cycleConfirmed: true,
};
const ledger = { cycleStart: link.cycleStart, cycleEnd: link.cycleEnd,
  cycleUsedBytes: 4720e9, rawBytes: 1000, at: at.toISOString(), baselineConfirmed: true };

test("5 TB decimal includes the reserve, leaving 280 GB at 4.72 TB", () => {
  const b = calculateFupBudget(link, ledger, at);
  assert.equal(b.phase, "reserve");
  assert.equal(b.remainingGB, 280);
  assert.equal(b.reserveRemainingGB, 280);
  assert.equal(b.ordinaryRemainingGB, 0);
  assert.equal(b.dailyBudgetGB, 280 / 16.5);
  assert.equal(Date.parse(b.windows[3].endsAt!), Date.parse(link.cycleEnd));
  assert.equal(b.windows[3].budgetGB, 280);
});
test("an exhausted quota grants neither a new reserve nor a minimum rate", () => {
  for (const used of [5000e9, 6120e9]) {
    const b = calculateFupBudget(link, { ...ledger, cycleUsedBytes: used }, at);
    assert.equal(b.phase, "exhausted");
    assert.equal(b.reserveRemainingGB, 0);
    assert.equal(b.aggregateBps, 0);
  }
});
test("mini budget and weekly horizons use its own cycle", () => {
  const mini = { ...link, id: "mini", interface: "E2-WAN-FAI", cycleStart: "2026-10-09T00:00:00Z", cycleEnd: "2026-11-09T00:00:00Z" };
  const b = calculateFupBudget(mini, { ...ledger, cycleStart: mini.cycleStart, cycleEnd: mini.cycleEnd, cycleUsedBytes: 2050e9 }, at);
  assert.equal(b.ordinaryRemainingGB, 2450);
  assert.equal(b.reserveRemainingGB, 500);
  assert.deepEqual(b.windows.map(w => w.days), [7, 14, 21, 28]);
  assert.ok(Math.abs(b.windows[0].budgetGB! - 2450 * 7 / 22.5) < 1e-9);
});
test("stale, unknown, future and wrong-cycle measurements never produce an enforceable budget", () => {
  for (const invalid of [null, { ...ledger, baselineConfirmed: false },
    { ...ledger, at: "2026-10-17T11:50:00Z" }, { ...ledger, at: "2026-10-18T12:00:00Z" },
    { ...ledger, cycleStart: "2026-10-01T00:00:00Z" }]) {
    assert.equal(calculateFupBudget(link, invalid, at).phase, "unknown");
  }
  assert.equal(calculateFupBudget({ ...link, cycleConfirmed: false }, ledger, at).phase, "unknown");
});
test("ledger counts each interval once and refuses older samples", () => {
  const next = advanceFupLedger(link, ledger, 2000, new Date(at.getTime() + 60_000));
  assert.equal(next.cycleUsedBytes, ledger.cycleUsedBytes + 1000);
  assert.deepEqual(advanceFupLedger(link, next, 2000, new Date(next.at)), next);
  assert.deepEqual(advanceFupLedger(link, next, 3000, at), next);
});
test("missing raw sample, counter reset, or cycle rollover invalidate the baseline", () => {
  assert.equal(advanceFupLedger(link, ledger, null, new Date(at.getTime() + 60_000)).baselineConfirmed, false);
  assert.equal(advanceFupLedger(link, ledger, 500, new Date(at.getTime() + 60_000)).baselineConfirmed, false);
  const changed = { ...link, cycleStart: "2026-11-03T00:00:00Z", cycleEnd: "2026-12-03T00:00:00Z" };
  assert.equal(advanceFupLedger(changed, ledger, 2000, new Date("2026-11-03T00:01:00Z")).baselineConfirmed, false);
});
test("a first raw sample never invents the provider monthly usage", () => {
  const first = advanceFupLedger(link, null, 9876543210, at);
  assert.equal(first.baselineConfirmed, false);
  assert.equal(calculateFupBudget(link, first, at).phase, "unknown");
});
test("configuration rejects duplicate WANs, invalid cycles and reserves", () => {
  assert.equal(validateFupLinks([link]), null);
  for (const invalid of [[link, { ...link, id: "mini" }], [{ ...link, reserveGB: 5001 }],
    [{ ...link, cycleEnd: link.cycleStart }], [{ ...link, quotaGB: NaN }],
    [{ ...link, interface: "E1-WAN-FAI,E2-WAN-FAI" }]]) {
    assert.ok(validateFupLinks(invalid));
  }
});

test("malformed cycle dates remain unknown without breaking the report", () => {
  const budget = calculateFupBudget({ ...link, cycleStart: "", cycleEnd: "" }, ledger, at);
  assert.equal(budget.phase, "unknown");
  assert.ok(budget.windows.every(w => w.budgetGB === null));
});

test("a sample preceding the confirmed cycle cannot be trusted", () => {
  const futureLink = { ...link, cycleStart: "2026-10-17T11:59:00Z" };
  const prior = { ...ledger, cycleStart: futureLink.cycleStart, at: "2026-10-17T11:58:00Z" };
  assert.equal(calculateFupBudget(futureLink, prior, at).phase, "unknown");
});

test("uptime detects a reboot even when the new byte counter exceeds the old one", () => {
  const before = { ...ledger, uptimeSeconds: 86400 };
  const after = advanceFupLedger(link, before, 999999, new Date(at.getTime() + 300000), 120);
  assert.equal(after.baselineConfirmed, false);
  assert.equal(after.issue, "router_reboot_reconcile_required");
});
