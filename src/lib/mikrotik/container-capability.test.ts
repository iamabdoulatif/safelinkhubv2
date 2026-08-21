import assert from "node:assert/strict";
import test from "node:test";
import { findMikrotikModel, supportsContainersFor } from "./device-catalog";

test("l'accent circonflexe de RouterOS trouve la même carte que l'exposant", () => {
  /* RouterOS renvoie « hAP ax^3 », le catalogue écrit « hAP ax³ ». La
     normalisation ne traitait que l'exposant : seize routeurs du parc de
     production ne trouvaient AUCUNE entrée, donc ni architecture ni capacité
     conteneur — ils restaient inclassables pour toujours. */
  for (const [caret, exposant] of [
    ["hAP ax^2", "hAP ax²"],
    ["hAP ax^3", "hAP ax³"],
  ]) {
    const a = findMikrotikModel(caret);
    const b = findMikrotikModel(exposant);
    assert.ok(a, `« ${caret} » doit être reconnu`);
    assert.equal(a?.boardName, b?.boardName);
  }
  // Et les deux cartes restent DISTINCTES : les confondre ferait perdre à
  // l'ax³ son exigence de stockage USB pour le conteneur.
  assert.notEqual(findMikrotikModel("hAP ax^2")?.boardName, findMikrotikModel("hAP ax^3")?.boardName);
});

test("une capacité mesurée l'emporte sur la déduction du catalogue", () => {
  // Un false enregistré vient d'un auto-setup qui a lu la vraie architecture.
  // Le catalogue ne doit jamais le contredire : on reposerait un conteneur sur
  // une carte qui l'a refusé.
  assert.equal(supportsContainersFor(false, "hAP ax^3"), false);
  assert.equal(supportsContainersFor(true, "RB951Ui-2HnD"), true);
});

test("sans mesure, le modèle connu suffit à classer", () => {
  assert.equal(supportsContainersFor(null, "RB951Ui-2HnD"), false, "MIPS = pas de conteneur");
  assert.equal(supportsContainersFor(null, "hAP ax^3"), true, "ARM64 = conteneur");
  assert.equal(supportsContainersFor(null, "RB4011iGS+"), true);
});

test("un modèle inconnu reste un « je ne sais pas », pas une famille par défaut", () => {
  for (const inconnu of [null, undefined, "", "Bidule 9000"]) {
    assert.equal(supportsContainersFor(null, inconnu), null, `« ${inconnu} » ne doit rien inventer`);
  }
});

test("le parc de production réel se classe entièrement", () => {
  // Modèles relevés en base le 2026-08-21. Aucun n'est MIPS : la famille
  // « sans conteneur », et donc le domaine dédié, ne concerne aujourd'hui
  // aucun routeur de ce parc.
  const parc = [
    "hAP ax^3", "hAP ax lite", "hAP ax^2", "RB4011iGS+5HacQ2HnD", "Chateau Pro ax",
    "RB3011UiAS", "L009UiGS-2HaxD", "RB5009UG+S+", "RB4011iGS+",
  ];
  for (const model of parc) {
    assert.equal(supportsContainersFor(null, model), true, `${model} devrait être classé`);
  }
});
