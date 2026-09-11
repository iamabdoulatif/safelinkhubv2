import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PORTAL_REPAIR_COOLDOWN_MS, shouldRepair } from "./hotspot-portal-watch";

const suspect = { newDevices: 24, formLogins: 0, cookieLogins: 80, verdict: "suspect" as const };
const ok = { ...suspect, formLogins: 2, verdict: "ok" as const };
const now = new Date("2026-09-11T12:00:00Z");

describe("veille du portail : quand relancer", () => {
  it("suspect et jamais relancé → relance", () => {
    assert.equal(shouldRepair(suspect, null, now), "repair");
  });

  it("suspect mais relancé il y a moins de six heures → on attend", () => {
    // Un site où personne n'achète de ticket pendant une nuit ressemble à la
    // panne : sans débounce, chaque sync relancerait le serveur.
    const recent = new Date(now.getTime() - PORTAL_REPAIR_COOLDOWN_MS + 60_000);
    assert.equal(shouldRepair(suspect, recent, now), "cooldown");
    const ancien = new Date(now.getTime() - PORTAL_REPAIR_COOLDOWN_MS - 60_000);
    assert.equal(shouldRepair(suspect, ancien, now), "repair");
  });

  it("ok ou indécis → rien", () => {
    assert.equal(shouldRepair(ok, null, now), "none");
    assert.equal(shouldRepair({ ...suspect, newDevices: 2, verdict: "unknown" }, null, now), "none");
  });
});
