import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeRoamingMac, summarizeBindingRouters } from "./device-binding";

describe("liaison d'appareil roaming", () => {
  it("normalise une MAC et rejette une valeur incomplète", () => {
    assert.equal(normalizeRoamingMac("aa-bb-cc-dd-ee-ff"), "AA:BB:CC:DD:EE:FF");
    assert.equal(normalizeRoamingMac("AA:BB:CC"), "");
  });

  it("distingue les zones synchronisées de celles à reprendre", () => {
    assert.deepEqual(
      summarizeBindingRouters([
        { routerId: "nord", status: "SYNCED", lastError: null },
        { routerId: "sud", status: "PENDING", lastError: null },
        { routerId: "est", status: "ERROR", lastError: "timeout" },
      ]),
      { total: 3, synced: 1, pending: 2, errors: ["timeout"] },
    );
  });
});
