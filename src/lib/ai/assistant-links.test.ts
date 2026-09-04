import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { tokenizeAssistantText } from "./assistant-links";

const liens = (t: string) =>
  tokenizeAssistantText(t).filter((j) => j.kind === "link").map((j) => j.value);

describe("liens de l'assistant", () => {
  it("rend cliquables les pages du site, avec ou sans préfixe de langue", () => {
    assert.deepEqual(liens("Voyez /vpn et /en/services."), ["/vpn", "/en/services"]);
    assert.deepEqual(liens("Rendez-vous sur https://safelinkhub.io/contact."), [
      "https://safelinkhub.io/contact",
    ]);
  });

  it("laisse en TEXTE ce qui sortirait du domaine", () => {
    // Un modèle peut écrire n'importe quelle adresse, y compris soufflée par le
    // visiteur : aucune ne doit devenir un lien cliquable dans notre page.
    assert.deepEqual(liens("Allez sur https://evil.example/steal maintenant"), []);
    assert.deepEqual(liens("javascript:alert(1) et //evil.example"), []);
  });

  it("ne mange pas la ponctuation de fin de phrase", () => {
    const jetons = tokenizeAssistantText("Tarifs sur /vpn, puis /contact.");
    assert.deepEqual(liens("Tarifs sur /vpn, puis /contact."), ["/vpn", "/contact"]);
    // La virgule et le point restent affichés.
    assert.equal(jetons.map((j) => j.value).join(""), "Tarifs sur /vpn, puis /contact.");
  });

  it("restitue le texte à l'identique", () => {
    const texte = "Bonjour ! Créez un compte sur /auth/register (gratuit).";
    assert.equal(
      tokenizeAssistantText(texte).map((j) => j.value).join(""),
      texte,
    );
  });
});
