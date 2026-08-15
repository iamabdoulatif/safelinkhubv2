import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_PORTALS, portalsToSeed } from "./default-portals";

describe("portails livrés d'office", () => {
  it("sème les deux portails dans un compte vierge", () => {
    assert.deepEqual(portalsToSeed([]).map((p) => p.name), ["hotspot-sfh1", "hotspot-sfh2"]);
  });

  it("ne re-sème jamais un portail déjà présent", () => {
    // Le contenu d'un portail adopté peut avoir été personnalisé : le réécrire
    // à chaque lecture de la liste effacerait le travail de l'exploitant.
    assert.deepEqual(portalsToSeed(["hotspot-sfh1"]).map((p) => p.name), ["hotspot-sfh2"]);
    assert.deepEqual(portalsToSeed(["hotspot-sfh1", "hotspot-sfh2"]), []);
    assert.deepEqual(portalsToSeed(["hotspot-sfh2", "Mon portail à moi"]).map((p) => p.name), [
      "hotspot-sfh1",
    ]);
  });

  it("les deux portails chargent réellement des fichiers", () => {
    for (const portal of DEFAULT_PORTALS) {
      const files = portal.load();
      assert.ok(files.length > 0, `${portal.name} doit livrer des fichiers`);
      assert.ok(
        files.some((f) => /login\.html$/i.test(f.path)),
        `${portal.name} doit contenir un login.html`,
      );
    }
  });
});
