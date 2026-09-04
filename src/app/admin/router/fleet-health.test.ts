import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeFleetHealth, isOfflineRouter } from "./fleet-health";

const at = (ms: number | null) => ({ id: String(ms), status: "offline", lastSyncAtMs: ms });

describe("santé du parc", () => {
  it("compte les états et calcule la disponibilité", () => {
    const health = computeFleetHealth([
      { id: "a", status: "online", lastSyncAtMs: 1 },
      { id: "b", status: "online", lastSyncAtMs: 1 },
      { id: "c", status: "offline", lastSyncAtMs: 1 },
      { id: "d", status: "installing", lastSyncAtMs: null },
    ]);

    assert.deepEqual(
      { t: health.total, on: health.online, off: health.offline, cfg: health.configuring },
      { t: 4, on: 2, off: 1, cfg: 1 },
    );
    // « En configuration » n'est pas « en ligne » : il pèse dans le
    // dénominateur, sinon la disponibilité afficherait 66 % au lieu de 50 %.
    assert.equal(health.availability, 50);
  });

  it("un parc vide n'a pas 0 % de disponibilité, il n'en a pas", () => {
    const health = computeFleetHealth([]);
    assert.equal(health.availability, null);
    assert.deepEqual(health.attention, []);
  });

  it("met le jamais-synchronisé en tête de la zone d'attention", () => {
    const health = computeFleetHealth([at(5_000), at(null), at(1_000)]);
    assert.deepEqual(
      health.attention.map((r) => r.lastSyncAtMs),
      [null, 1_000, 5_000],
    );
  });

  it("un routeur en configuration ne demande pas d'attention", () => {
    assert.equal(isOfflineRouter("pending"), false);
    assert.equal(isOfflineRouter("installing"), false);
    assert.equal(isOfflineRouter("online"), false);
    assert.equal(isOfflineRouter("offline"), true);
  });
});
