import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { guardCreateSite, guardAssignRouter, normalizeSiteCode } from "./site-rules";

describe("règles des sites", () => {
  it("normalise un code en MAJUSCULES/tirets, accents retirés", () => {
    assert.equal(normalizeSiteCode("  Agence Dakar  "), "AGENCE-DAKAR");
    assert.equal(normalizeSiteCode("Siège (HQ) #1"), "SIEGE-HQ-1");
  });

  it("refuse un nom vide", () => {
    const v = guardCreateSite({ name: "   ", code: "" });
    assert.equal(v.ok, false);
  });

  it("dérive le code du nom quand il manque, et renvoie les valeurs nettoyées", () => {
    const v = guardCreateSite({ name: "  Agence Plateau  ", code: "" });
    assert.equal(v.ok, true);
    assert.equal(v.name, "Agence Plateau");
    assert.equal(v.code, "AGENCE-PLATEAU");
  });

  it("refuse un code sans aucun caractère alphanumérique", () => {
    const v = guardCreateSite({ name: "###", code: "@@@" });
    assert.equal(v.ok, false);
  });

  it("n'affecte qu'un routeur ET un site de la même org", () => {
    assert.equal(
      guardAssignRouter({ routerOrgId: "o1", siteOrgId: "o1", sessionOrgId: "o1" }).ok,
      true,
    );
    assert.equal(
      guardAssignRouter({ routerOrgId: "o2", siteOrgId: "o1", sessionOrgId: "o1" }).ok,
      false,
    );
    assert.equal(
      guardAssignRouter({ routerOrgId: "o1", siteOrgId: "o2", sessionOrgId: "o1" }).ok,
      false,
    );
    assert.equal(
      guardAssignRouter({ routerOrgId: null, siteOrgId: "o1", sessionOrgId: "o1" }).ok,
      false,
    );
  });
});
