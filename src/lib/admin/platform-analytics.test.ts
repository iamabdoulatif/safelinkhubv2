import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildPlatformSalesCsv,
  summarizePlatformSales,
  type PlatformSaleRow,
} from "./platform-analytics";

const rows: PlatformSaleRow[] = [
  {
    id: "vpn-1",
    kind: "vpn",
    orgId: "org-a",
    orgName: "Organisation A",
    requesterName: "Awa Traoré",
    requesterEmail: "awa@example.com",
    amountFcfa: 15000,
    paymentMethod: "wave",
    service: "winbox",
    billingPeriod: "yearly",
    status: "approved",
    consumedAt: "2026-07-21T10:00:00.000Z",
    createdAt: "2026-07-21T09:00:00.000Z",
  },
  {
    id: "setup-1",
    kind: "auto_setup",
    orgId: "org-a",
    orgName: "Organisation A",
    requesterName: "Awa Traoré",
    requesterEmail: "awa@example.com",
    amountFcfa: 10000,
    paymentMethod: "geniuspay",
    service: null,
    billingPeriod: null,
    status: "approved",
    consumedAt: null,
    createdAt: "2026-07-20T09:00:00.000Z",
  },
  {
    id: "vpn-2",
    kind: "vpn",
    orgId: "org-b",
    orgName: "Organisation B",
    requesterName: "Moussa Diarra",
    requesterEmail: "moussa@example.com",
    amountFcfa: 8000,
    paymentMethod: "wave",
    service: "ssh",
    billingPeriod: "monthly",
    status: "pending",
    consumedAt: null,
    createdAt: "2026-07-21T12:00:00.000Z",
  },
  {
    id: "setup-2",
    kind: "auto_setup",
    orgId: "org-c",
    orgName: "Organisation C",
    requesterName: "Kadiatou Coulibaly",
    requesterEmail: "kadiatou@example.com",
    amountFcfa: 10000,
    paymentMethod: "orange",
    service: null,
    billingPeriod: null,
    status: "rejected",
    consumedAt: null,
    createdAt: "2026-07-19T09:00:00.000Z",
  },
];

describe("analyse commerciale plateforme", () => {
  it("sépare les ventes VPN et auto-setup et ne compte que les paiements validés", () => {
    const report = summarizePlatformSales(rows, {
      from: new Date("2026-07-19T00:00:00.000Z"),
      to: new Date("2026-07-21T23:59:59.999Z"),
    });

    assert.equal(report.kpis.totalAmountFcfa, 25000);
    assert.equal(report.kpis.vpnAmountFcfa, 15000);
    assert.equal(report.kpis.autoSetupAmountFcfa, 10000);
    assert.equal(report.kpis.approvedCount, 2);
    assert.equal(report.kpis.pendingCount, 1);
    assert.equal(report.kpis.rejectedCount, 1);
    assert.equal(report.kpis.activeOrganizations, 1);
  });

  it("calcule conversion, activation et répartition par jour", () => {
    const report = summarizePlatformSales(rows, {
      from: new Date("2026-07-19T00:00:00.000Z"),
      to: new Date("2026-07-21T23:59:59.999Z"),
    });

    assert.equal(report.kpis.conversionRate, 50);
    assert.equal(report.kpis.activationRate, 50);
    assert.deepEqual(
      report.daily.map((point) => [point.day, point.vpnAmountFcfa, point.autoSetupAmountFcfa]),
      [
        ["2026-07-19", 0, 0],
        ["2026-07-20", 0, 10000],
        ["2026-07-21", 15000, 0],
      ],
    );
    assert.equal(report.paymentMethods[0].method, "wave");
    assert.equal(report.services[0].service, "winbox");
  });

  it("génère un export CSV lisible avec les montants et le type de vente", () => {
    const csv = buildPlatformSalesCsv(rows.filter((row) => row.status === "approved"));
    assert.match(csv, /^\uFEFFType,Demandeur,Email,Organisation/);
    assert.match(csv, /"VPN","Awa Traoré","awa@example.com","Organisation A"/);
    assert.match(csv, /"Auto-Setup".*10000/);
  });
});
