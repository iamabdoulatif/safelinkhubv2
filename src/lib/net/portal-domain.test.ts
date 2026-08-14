import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { portalDomainSuggestions, ssidFromHotspotName, slugifyDomain } from "./portal-domain";

describe("nom du hotspot → SSID et domaine", () => {
  it("rend le SSID lisible : NAMOIN-WIFI → NAMOIN WIFI", () => {
    assert.equal(ssidFromHotspotName("NAMOIN-WIFI"), "NAMOIN WIFI");
    assert.equal(ssidFromHotspotName("Chez_Fatou--WIFI"), "Chez Fatou WIFI");
    assert.equal(ssidFromHotspotName("  YAHYA  "), "YAHYA");
  });

  it("propose les domaines attendus pour NAMOIN-WIFI", () => {
    assert.deepEqual(portalDomainSuggestions("NAMOIN-WIFI"), [
      "1.namoin.ci",
      "namoin.ci",
      "namoin-wifi.ci",
      "namoin.net",
      "namoin-wifi.net",
    ]);
  });

  it("ne répète pas la racine quand le nom tient en un mot", () => {
    assert.deepEqual(portalDomainSuggestions("YAHYA"), ["1.yahya.ci", "yahya.ci", "yahya.net"]);
  });

  it("ne propose rien tant qu'il n'y a pas de nom exploitable", () => {
    for (const empty of ["", "   ", "---", "!!!"]) {
      assert.deepEqual(portalDomainSuggestions(empty), [], JSON.stringify(empty));
    }
  });

  it("produit toujours des étiquettes DNS valides", () => {
    // Accents, espaces et ponctuation ne doivent pas franchir la frontière.
    for (const name of ["Chez Fatou_WIFI", "Café Léa", "MIRADOR  WIFI!!"]) {
      for (const domain of portalDomainSuggestions(name)) {
        assert.match(domain, /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9-]+)+$/, domain);
      }
    }
    assert.equal(slugifyDomain("Café Léa"), "cafe-lea");
  });
});
