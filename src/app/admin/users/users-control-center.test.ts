import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildUsersCsv, filterUsers, type UserControlRow } from "./users-control-center";

const rows: UserControlRow[] = [
  {
    id: "1",
    name: "Awa Traoré",
    email: "awa@example.com",
    orgName: "Organisation Awa",
    role: "admin",
    quotaCategory: "free",
    quotaLabel: "Gratuit jusqu'au 15 août 2026",
    quotaExpiresAt: "2026-08-15T00:00:00.000Z",
    createdAt: "2026-07-01T00:00:00.000Z",
  },
  {
    id: "2",
    name: "Moussa Diarra",
    email: "moussa@example.com",
    orgName: "Organisation B",
    role: "superadmin",
    quotaCategory: "paid",
    quotaLabel: "VPN payant",
    quotaExpiresAt: null,
    createdAt: "2026-06-01T00:00:00.000Z",
  },
];

describe("station de contrôle utilisateurs", () => {
  it("filtre par recherche et par catégorie quota", () => {
    assert.equal(filterUsers(rows, "awa", "all", new Date("2026-07-22T00:00:00.000Z")).length, 1);
    assert.equal(filterUsers(rows, "", "paid", new Date("2026-07-22T00:00:00.000Z")).length, 1);
    assert.equal(filterUsers(rows, "organisation b", "all", new Date("2026-07-22T00:00:00.000Z"))[0].id, "2");
  });

  it("identifie les quotas qui expirent dans les 30 jours", () => {
    assert.equal(filterUsers(rows, "", "expiring", new Date("2026-07-22T00:00:00.000Z")).length, 1);
    assert.equal(filterUsers(rows, "", "expiring", new Date("2026-09-01T00:00:00.000Z")).length, 0);
  });

  it("génère un CSV UTF-8 échappé", () => {
    const csv = buildUsersCsv(rows);
    assert.match(csv, /^\uFEFFNom,Email,Organisation/);
    assert.match(csv, /"Awa Traoré","awa@example.com"/);
    assert.match(csv, /"Organisation Awa"/);
  });
});
