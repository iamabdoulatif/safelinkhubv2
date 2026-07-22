import test from "node:test";
import assert from "node:assert/strict";
import { fcfaToScCents, scCentsToFcfa, priceScInCents } from "./pricing";

test("convertit 500 FCFA en 5 SC sans perte", () => {
  assert.equal(fcfaToScCents(500), 500);
  assert.equal(scCentsToFcfa(500), 500);
});

test("arrondit vers le haut au centième de SC", () => {
  assert.equal(fcfaToScCents(501), 501);
  assert.equal(priceScInCents(1_301), 1_301);
});

test("refuse les montants négatifs et non entiers", () => {
  assert.throws(() => fcfaToScCents(-1), /positif/);
  assert.throws(() => fcfaToScCents(1.5), /entier/);
});
