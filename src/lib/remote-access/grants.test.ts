import test from "node:test";
import assert from "node:assert/strict";
import { TEMPORARY_ACCESS_DURATIONS, expiresAtFor, grantCovers, isGrantUsable } from "./grants";

test("calcule les quatre durées de pass", () => {
  assert.deepEqual(Object.keys(TEMPORARY_ACCESS_DURATIONS), ["hour_1", "hour_2", "day_7", "day_10"]);
  assert.equal(expiresAtFor("hour_1", new Date("2026-07-22T10:00:00Z")).toISOString(), "2026-07-22T11:00:00.000Z");
});

test("un pass expiré ou révoqué ne débloque pas l'accès", () => {
  assert.equal(isGrantUsable({ status: "expired", startsAt: new Date("2026-07-20"), expiresAt: new Date("2026-07-21") }), false);
  assert.equal(isGrantUsable({ status: "revoked", startsAt: new Date("2026-07-20"), expiresAt: new Date("2026-07-23") }), false);
});

test("la portée limite le pass au routeur et au service", () => {
  assert.equal(grantCovers({ routerId: "r1", services: ["winbox"] }, "r1", "winbox"), true);
  assert.equal(grantCovers({ routerId: "r1", services: ["winbox"] }, "r2", "winbox"), false);
  assert.equal(grantCovers({ routerId: null, services: [] }, "r2", "ssh"), true);
});
