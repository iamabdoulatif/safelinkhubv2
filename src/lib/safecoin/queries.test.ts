import test from "node:test";
import assert from "node:assert/strict";
import { aggregateSafecoinEntries } from "./queries";

test("les agrégats Safecoin séparent émission, consommation et frais", () => {
  const report = aggregateSafecoinEntries([
    { orgId: "o1", amountScCents: 1000, entryType: "topup", status: "completed", createdAt: new Date("2026-07-01") },
    { orgId: "o1", amountScCents: -500, entryType: "vpn_charge", status: "completed", createdAt: new Date("2026-07-01") },
    { orgId: "o1", amountScCents: -25, entryType: "fee", status: "completed", createdAt: new Date("2026-07-02") },
    { orgId: "o2", amountScCents: 500, entryType: "admin_credit", status: "pending", createdAt: new Date("2026-07-02") },
  ]);
  assert.deepEqual(report.kpis, { issued: 1000, spent: 500, fees: 25, circulating: 475, activeOrganizations: 1 });
  assert.equal(report.daily.length, 2);
  assert.equal(report.daily[0].issued, 1000);
});
