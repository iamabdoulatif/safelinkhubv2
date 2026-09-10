import assert from "node:assert/strict";
import test from "node:test";
import { portalPlanObjects, type PortalPlan } from "./package-files";

const plan = (over: Partial<PortalPlan> = {}): PortalPlan => ({
  id: "p1",
  name: "01-JOUR",
  priceCents: 200,
  durationValue: 1,
  durationUnit: "Days",
  ...over,
});

test("un forfait plafonné annonce son volume au portail", () => {
  const [dto] = portalPlanObjects([plan({ dataCapMb: 3072 })]);
  assert.equal(dto.capLabel, "3 Go");
});

test("un forfait sans plafond n'annonce rien", () => {
  // null, pas "Illimité" : c'est le portail qui choisit ce qu'il en dit.
  assert.equal(portalPlanObjects([plan()])[0].capLabel, null);
  assert.equal(portalPlanObjects([plan({ dataCapMb: null })])[0].capLabel, null);
  assert.equal(portalPlanObjects([plan({ dataCapMb: 0 })])[0].capLabel, null);
});

test("le reste du contrat du portail ne bouge pas", () => {
  // Un portail déjà installé lit ces champs : en changer un le casserait.
  const [dto] = portalPlanObjects([plan({ dataCapMb: 3072 })]);
  assert.deepEqual(Object.keys(dto).sort(), [
    "capLabel",
    "durationUnit",
    "durationValue",
    "id",
    "label",
    "name",
    "payDisabled",
    "price",
    "priceLabel",
  ]);
  assert.equal(dto.label, "01 Jour");
  assert.equal(dto.priceLabel, "200 FCFA");
});
