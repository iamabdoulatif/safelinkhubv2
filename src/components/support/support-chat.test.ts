import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readPath } from "./SupportChat";

describe("portée de l'assistant", () => {
  it("se retire là où il n'a rien à faire", () => {
    // Le portail captif est servi derrière le walled-garden à des téléphones
    // qui n'ont pas encore payé : rien d'optionnel n'y est chargé.
    for (const chemin of ["/portal/pay", "/admin/router", "/admin", "/auth/login"]) {
      assert.equal(readPath(chemin).hidden, true, chemin);
    }
  });

  it("accompagne le visiteur sur tout le site public", () => {
    for (const chemin of ["/", "/vpn", "/services", "/blog/article", "/contact", "/en", "/en/vpn"]) {
      assert.equal(readPath(chemin).hidden, false, chemin);
    }
  });

  it("parle la langue de la page", () => {
    assert.equal(readPath("/en/services").locale, "en");
    assert.equal(readPath("/en").locale, "en");
    // « /english » n'est pas la version anglaise : le préfixe est un segment.
    assert.equal(readPath("/english-page").locale, "fr");
    assert.equal(readPath("/vpn").locale, "fr");
  });
});
