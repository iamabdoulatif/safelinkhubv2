import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildUsersRegisterSummary, userMonogram } from "./users-register";

describe("registre utilisateurs", () => {
  it("résume les lignes visibles par attention, quota et organisation", () => {
    const summary = buildUsersRegisterSummary(
      [
        { orgName: "Alpha", quotaCategory: "free", quotaExpiresAt: "2026-08-10T00:00:00.000Z" },
        { orgName: "Alpha", quotaCategory: "unlimited", quotaExpiresAt: null },
        { orgName: "Bêta", quotaCategory: "paid", quotaExpiresAt: null },
      ],
      new Date("2026-08-04T00:00:00.000Z"),
    );

    assert.deepEqual(summary, {
      attentionCount: 1,
      freeCount: 2,
      paidCount: 1,
      organizationCount: 2,
    });
  });

  it("n'inclut pas les expirations passées dans les attentions", () => {
    const summary = buildUsersRegisterSummary(
      [{ orgName: "Alpha", quotaCategory: "free", quotaExpiresAt: "2026-08-03T23:59:59.000Z" }],
      new Date("2026-08-04T00:00:00.000Z"),
    );

    assert.equal(summary.attentionCount, 0);
  });

  it("construit les monogrammes des utilisateurs", () => {
    assert.equal(userMonogram("Awa Traoré"), "AT");
    assert.equal(userMonogram("  Diallo  "), "DI");
  });
});
