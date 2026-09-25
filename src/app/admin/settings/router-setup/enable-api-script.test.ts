import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { enableApiScript } from "./MethodTabs";

describe("script de connexion directe", () => {
  it("porte la vraie IP du serveur, plus un marqueur à remplacer à la main", () => {
    const script = enableApiScript("31.97.153.83");
    assert.equal(script, "/ip service set api port=8728 address=31.97.153.83/32 disabled=no");
    assert.doesNotMatch(script, /</);
  });

  it("reste en syntaxe RouterOS 6 (espaces, pas de chemin à slashs)", () => {
    assert.doesNotMatch(enableApiScript("1.2.3.4"), /^\/[a-z-]+\/[a-z]/);
  });

  it("dit ce qui manque quand l'IP est inconnue", () => {
    assert.match(enableApiScript(null), /<ip-du-serveur-safelinkhub>/);
  });
});
