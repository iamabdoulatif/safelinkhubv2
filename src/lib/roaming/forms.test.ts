import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  newRoamingRouterIds,
  parseRoamingPriceOverride,
  roamingGroupCode,
  roamingRouterProfileName,
} from "./forms";

describe("formulaires roaming", () => {
  it("génère un code de groupe lisible à partir de son nom", () => {
    assert.equal(roamingGroupCode("CIV · Roaming"), "CIV-ROAMING");
    assert.equal(roamingGroupCode("  Abidjan   Nord "), "ABIDJAN-NORD");
  });

  it("distingue un prix hérité d'une surcharge à zéro", () => {
    assert.equal(parseRoamingPriceOverride(""), null);
    assert.equal(parseRoamingPriceOverride("0"), 0);
    assert.equal(parseRoamingPriceOverride("2 000"), 2000);
    assert.equal(parseRoamingPriceOverride("-1"), undefined);
  });

  it("donne à chaque groupe un profil RouterOS isolé", () => {
    assert.equal(
      roamingRouterProfileName("a1b2c3d4-e5f6-7890-abcd-ef0123456789", "01-JOUR"),
      "ROAM-A1B2C3D4E5F6-01-JOUR",
    );
  });

  it("ne propose à l'ajout que les zones qui ne couvrent pas déjà le groupe", () => {
    assert.deepEqual(
      newRoamingRouterIds(["zone-nord", "zone-sud"], ["zone-sud", "zone-est", "zone-est", ""]),
      ["zone-est"],
    );
  });
});
