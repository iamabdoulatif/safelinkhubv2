import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findMikrotikModel, supportsContainersFor } from "./device-catalog";

/** Ce que l'écran MikHmon Online fait de ce modèle, sans mesure préalable. */
function classe(model: string) {
  const c = supportsContainersFor(null, model);
  return c === false ? "sans conteneur" : c === true ? "avec conteneur" : "capacité inconnue";
}

describe("les MIPS d'entrée de gamme sont reconnus", () => {
  it("les cartes qui ne peuvent PAS héberger de conteneur sont classées comme telles", () => {
    /* C'est ce classement, et lui seul, qui fait apparaître « Activer depuis
       MikHmon Online » : une carte en « capacité inconnue » ne reçoit aucune
       proposition de domaine dédié, alors que ces MIPS-là sont exactement le
       public visé. */
    for (const carte of [
      "RB941-2nD", "hAP lite", "hAP lite TC", "RB941-2nD-TC",
      "RB952Ui-5ac2nD", "hAP ac lite",
      "RB951Ui-2nD", "hAP",
      "RB962UiGS-5HacT2HnT", "hAP ac",
      "RB750r2", "hEX lite",
      "RB750UPr2", "hEX PoE lite",
      "RB960PGS", "hEX PoE",
      "RB2011UiAS-2HnD", "RB2011UiAS-RM",
      "RB951Ui-2HnD", "hEX", "hEX S", "wAP", "wAP AC",
    ]) {
      assert.equal(classe(carte), "sans conteneur", carte);
    }
  });

  it("un hEX déclaré par son code de carte tombe sur la même entrée", () => {
    // RouterOS renvoie « RB750Gr3 » ou « hEX » selon la version : les deux
    // désignent la même carte et doivent se classer pareil.
    assert.equal(findMikrotikModel("RB750Gr3")?.boardName, "hEX");
    assert.equal(findMikrotikModel("RB760iGS")?.boardName, "hEX S");
  });
});

describe("l'alias « hAP » ne vole pas les cartes ARM", () => {
  it("toute la famille hAP moderne reste compatible conteneur", () => {
    /* Ce que ce test garde, c'est la frontière ARM/MIPS après l'ajout d'une
       douzaine d'entrées portant « hAP » dans leur nom. Une carte ARM classée
       « sans conteneur » se verrait proposer un domaine cloud facturé dont
       elle n'a aucun besoin.

       Vérifié plutôt que supposé : une entrée nommée « hAP » n'attrape PAS
       « hAP ax lite » — la correspondance exacte passe avant. Ma première
       version du commentaire affirmait le contraire. Ce qui tient la frontière
       est l'ordre du tableau, d'où le choix du code de carte, qui n'en dépend
       pas. */
    for (const carte of [
      "hAP ax lite", "hAP ax²", "hAP ax^2", "hAP ax³", "hAP ax^3", "hAP ax S",
      "hAP ac²", "hAP ac³", "hAP be lite", "hAP be³ Media",
    ]) {
      assert.equal(classe(carte), "avec conteneur", carte);
    }
  });

  it("le parc réel de production garde son classement", () => {
    // Les 9 modèles effectivement liés au 27/08/2026, relevés en base.
    for (const carte of [
      "hAP ax^3", "hAP ax lite", "hAP ax^2", "RB4011iGS+5HacQ2HnD", "RB4011iGS+",
      "L009UiGS-2HaxD", "RB5009UG+S+", "RB3011UiAS", "Chateau Pro ax",
    ]) {
      assert.equal(classe(carte), "avec conteneur", carte);
    }
  });
});

describe("ce qui reste inconnu le reste", () => {
  it("une carte hors catalogue n'est pas devinée", () => {
    // Mieux vaut « capacité inconnue » qu'un classement inventé : c'est
    // l'auto-setup qui tranchera en lisant l'architecture sur l'appareil.
    assert.equal(classe("Un modèle qui n'existe pas"), "capacité inconnue");
    assert.equal(supportsContainersFor(null, null), null);
  });

  it("une mesure faite sur l'appareil prime sur le catalogue", () => {
    // supports_containers est écrit par l'auto-setup : il a vu la vraie carte.
    assert.equal(supportsContainersFor(true, "RB941-2nD"), true);
    assert.equal(supportsContainersFor(false, "hAP ax³"), false);
  });
});
