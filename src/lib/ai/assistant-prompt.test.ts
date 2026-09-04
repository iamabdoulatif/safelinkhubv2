import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildAssistantSystemPrompt } from "./assistant-prompt";
import { SITE_PHONE_DISPLAY } from "@/lib/site/contact";

const faqs = [{ q: "Qu'est-ce que le Safecoin ?", a: "1 SC vaut 100 FCFA." }];

describe("cadrage de l'assistant", () => {
  it("verse la FAQ publiée dans ce que le modèle sait", () => {
    const prompt = buildAssistantSystemPrompt({ locale: "fr", faqs });
    assert.match(prompt, /Qu'est-ce que le Safecoin \?/);
    assert.match(prompt, /1 SC vaut 100 FCFA\./);
  });

  it("interdit d'inventer et donne la sortie de secours", () => {
    for (const locale of ["fr", "en"] as const) {
      const prompt = buildAssistantSystemPrompt({ locale, faqs });
      assert.match(prompt, /JAMAIS|NEVER/);
      // Un visiteur laissé sans réponse doit toujours avoir où aller.
      assert.match(prompt, /\/contact/);
      assert.ok(prompt.includes(SITE_PHONE_DISPLAY));
      // Aucun secret ne doit transiter par une conversation publique.
      assert.match(prompt, /mot de passe|password/);
    }
  });

  it("ne cite que des pages qui existent vraiment", () => {
    const prompt = buildAssistantSystemPrompt({ locale: "fr", faqs });
    const cites = [...prompt.matchAll(/^(\/[a-z/-]*)/gm)].map((m) => m[1]);
    const reelles = new Set([
      "/",
      "/services",
      "/vpn",
      "/formations",
      "/blog",
      "/contact",
      "/auth/register",
      "/auth/login",
    ]);
    for (const lien of cites) assert.ok(reelles.has(lien), `page inconnue citée : ${lien}`);
  });
});
