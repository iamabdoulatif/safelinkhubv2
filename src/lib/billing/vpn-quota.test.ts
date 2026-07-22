import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeVpnQuotaGrant,
  getVpnQuotaStatus,
  shouldChargeVpnActivation,
  VPN_QUOTA_GRANT_OPTIONS,
} from "./vpn-quota";

const NOW = new Date("2026-06-28T12:00:00.000Z");

describe("vpn quota grants", () => {
  it("computes the supported free quota windows from the grant option", () => {
    assert.deepEqual(
      VPN_QUOTA_GRANT_OPTIONS.map((option) => [option.value, option.label]),
      [
        ["free_1_hour", "Gratuit 1 heure"],
        ["free_2_hours", "Gratuit 2 heures"],
        ["free_7_days", "Gratuit 7 jours"],
        ["free_10_days", "Gratuit 10 jours"],
        ["free_1_month", "Gratuit 1 mois"],
        ["free_3_months", "Gratuit 3 mois"],
        ["free_6_months", "Gratuit 6 mois"],
        ["free_12_months", "Gratuit 12 mois"],
        ["unlimited", "Gratuit illimité"],
        ["paid", "VPN payant"],
      ],
    );

    assert.deepEqual(computeVpnQuotaGrant("free_1_hour", NOW), {
      mode: "free_until",
      expiresAt: new Date("2026-06-28T13:00:00.000Z"),
    });
    assert.deepEqual(computeVpnQuotaGrant("free_2_hours", NOW), {
      mode: "free_until",
      expiresAt: new Date("2026-06-28T14:00:00.000Z"),
    });
    assert.deepEqual(computeVpnQuotaGrant("free_7_days", NOW), {
      mode: "free_until",
      expiresAt: new Date("2026-07-05T12:00:00.000Z"),
    });
    assert.deepEqual(computeVpnQuotaGrant("free_10_days", NOW), {
      mode: "free_until",
      expiresAt: new Date("2026-07-08T12:00:00.000Z"),
    });

    assert.deepEqual(computeVpnQuotaGrant("free_1_month", NOW), {
      mode: "free_until",
      expiresAt: new Date("2026-07-28T12:00:00.000Z"),
    });
    assert.deepEqual(computeVpnQuotaGrant("free_3_months", NOW), {
      mode: "free_until",
      expiresAt: new Date("2026-09-28T12:00:00.000Z"),
    });
    assert.deepEqual(computeVpnQuotaGrant("free_6_months", NOW), {
      mode: "free_until",
      expiresAt: new Date("2026-12-28T12:00:00.000Z"),
    });
    assert.deepEqual(computeVpnQuotaGrant("free_12_months", NOW), {
      mode: "free_until",
      expiresAt: new Date("2027-06-28T12:00:00.000Z"),
    });
  });

  it("marks unlimited and paid overrides without an expiration date", () => {
    assert.deepEqual(computeVpnQuotaGrant("unlimited", NOW), {
      mode: "unlimited",
      expiresAt: null,
    });
    assert.deepEqual(computeVpnQuotaGrant("paid", NOW), {
      mode: "paid",
      expiresAt: null,
    });
  });

  it("reports whether an organization currently has free, paid, or default VPN access", () => {
    assert.deepEqual(
      getVpnQuotaStatus({ vpnQuotaMode: "free_until", vpnQuotaExpiresAt: new Date("2026-07-28T12:00:00.000Z") }, NOW),
      {
        mode: "free_until",
        free: true,
        paidOverride: false,
        unlimited: false,
        expiresAt: new Date("2026-07-28T12:00:00.000Z"),
        daysRemaining: 30,
      },
    );

    assert.deepEqual(
      getVpnQuotaStatus({ vpnQuotaMode: "free_until", vpnQuotaExpiresAt: new Date("2026-06-01T12:00:00.000Z") }, NOW),
      {
        mode: "default",
        free: false,
        paidOverride: false,
        unlimited: false,
        expiresAt: null,
        daysRemaining: 0,
      },
    );

    assert.deepEqual(
      getVpnQuotaStatus({ vpnQuotaMode: "unlimited", vpnQuotaExpiresAt: null }, NOW),
      {
        mode: "unlimited",
        free: true,
        paidOverride: false,
        unlimited: true,
        expiresAt: null,
        daysRemaining: Infinity,
      },
    );

    assert.deepEqual(
      getVpnQuotaStatus({ vpnQuotaMode: "paid", vpnQuotaExpiresAt: null }, NOW),
      {
        mode: "paid",
        free: false,
        paidOverride: true,
        unlimited: false,
        expiresAt: null,
        daysRemaining: 0,
      },
    );
  });

  it("decides whether a VPN activation should charge the wallet", () => {
    const orgCreatedAt = new Date("2026-01-01T00:00:00.000Z");

    assert.equal(
      shouldChargeVpnActivation({
        isSuperAdmin: true,
        orgCreatedAt,
        vpnQuotaMode: "paid",
        vpnQuotaExpiresAt: null,
        now: NOW,
      }),
      false,
    );

    assert.equal(
      shouldChargeVpnActivation({
        isSuperAdmin: false,
        orgCreatedAt,
        vpnQuotaMode: "free_until",
        vpnQuotaExpiresAt: new Date("2026-07-28T12:00:00.000Z"),
        now: NOW,
      }),
      false,
    );

    assert.equal(
      shouldChargeVpnActivation({
        isSuperAdmin: false,
        orgCreatedAt,
        vpnQuotaMode: "paid",
        vpnQuotaExpiresAt: null,
        now: NOW,
      }),
      true,
    );

    // Essai de 10 jours (VPN_TRIAL_DAYS) depuis l'inscription : org créée il y
    // a 3 jours → encore en essai, aucun débit.
    assert.equal(
      shouldChargeVpnActivation({
        isSuperAdmin: false,
        orgCreatedAt: new Date("2026-06-25T00:00:00.000Z"),
        vpnQuotaMode: "default",
        vpnQuotaExpiresAt: null,
        now: NOW,
      }),
      false,
    );

    // Org créée il y a ~6 mois : les 10 jours sont écoulés → débit.
    assert.equal(
      shouldChargeVpnActivation({
        isSuperAdmin: false,
        orgCreatedAt,
        vpnQuotaMode: "default",
        vpnQuotaExpiresAt: null,
        now: NOW,
      }),
      true,
    );

    assert.equal(
      shouldChargeVpnActivation({
        isSuperAdmin: false,
        orgCreatedAt: new Date("2024-01-01T00:00:00.000Z"),
        vpnQuotaMode: "default",
        vpnQuotaExpiresAt: null,
        now: NOW,
      }),
      true,
    );
  });
});
