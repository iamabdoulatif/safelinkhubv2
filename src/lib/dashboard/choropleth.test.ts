import { test } from "node:test";
import assert from "node:assert/strict";
import { colorBucket, countryMetrics, totalAccounts } from "./choropleth";

const countries = [
  { iso2: "CI", label: "Côte d’Ivoire", flag: "🇨🇮", accounts: 42, share: 0.88 },
  { iso2: "ML", label: "Mali", flag: "🇲🇱", accounts: 1, share: 0.02 },
  { iso2: null, label: "Non renseigné", flag: "—", accounts: 5, share: 0.1 },
];

test("calcule le total sans perdre les comptes non renseignés", () => {
  assert.equal(totalAccounts(countries), 48);
});

test("normalise l’ISO2 avant la recherche", () => {
  assert.deepEqual(countryMetrics(countries, " ci "), {
    label: "Côte d’Ivoire", accounts: 42, share: 0.88,
  });
});

test("classe les volumes en cinq aplats déterministes", () => {
  assert.equal(colorBucket(0, 42), 0);
  assert.equal(colorBucket(1, 42), 1);
  assert.equal(colorBucket(42, 42), 4);
  assert.equal(colorBucket(10, 0), 0);
});
