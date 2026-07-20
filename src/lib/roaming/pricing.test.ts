import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { effectiveRoamingPrice, roamingPriceSource } from "./pricing";

describe("tarification roaming", () => {
  it("utilise le tarif catalogue lorsqu'un groupe ne le surcharge pas", () => {
    assert.equal(effectiveRoamingPrice(300, null), 300);
    assert.equal(roamingPriceSource(null), "catalogue");
  });

  it("respecte une surcharge de groupe, y compris un tarif gratuit", () => {
    assert.equal(effectiveRoamingPrice(300, 100), 100);
    assert.equal(effectiveRoamingPrice(300, 0), 0);
    assert.equal(roamingPriceSource(0), "groupe");
  });
});
