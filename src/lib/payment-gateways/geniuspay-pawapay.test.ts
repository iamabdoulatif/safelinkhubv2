import assert from "node:assert/strict";
import { test } from "node:test";
import { pickPawapayProvider, type PawapayProvider } from "./geniuspay-org";

// Sélection du code opérateur PawaPay dont dépend le routage mobile money du
// portail (orange/mtn/moov → payment_method=pawapay + mmo_provider). Un mauvais
// mapping enverrait le paiement sur le mauvais opérateur.
const CI: PawapayProvider[] = [
  { code: "ORANGE_CIV", name: "Orange", type: "mmo" },
  { code: "MTN_MOMO_CIV", name: "MTN", type: "mmo" },
  { code: "MOOV_CIV", name: "Moov", type: "mmo" },
];

test("pickPawapayProvider : orange/mtn/moov → bon code opérateur", () => {
  assert.equal(pickPawapayProvider(CI, "orange"), "ORANGE_CIV");
  assert.equal(pickPawapayProvider(CI, "mtn"), "MTN_MOMO_CIV");
  assert.equal(pickPawapayProvider(CI, "moov"), "MOOV_CIV");
});

test("pickPawapayProvider : liste vide / opérateur absent → undefined (repli checkout hébergé)", () => {
  assert.equal(pickPawapayProvider([], "orange"), undefined);
  assert.equal(pickPawapayProvider([{ code: "ORANGE_CIV", name: "", type: "" }], "mtn"), undefined);
});
