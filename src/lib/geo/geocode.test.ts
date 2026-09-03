import assert from "node:assert/strict";
import test from "node:test";
import { isValidCoordinate, parseAddress } from "./geocode";

test("range une adresse Nominatim dans les quatre lignes affichées", () => {
  // Charge RÉELLE du service, relevée sur le bureau SafeLinkHub. La commune
  // (Attécoubé) n'apparaît dans aucune clé — seulement dans display_name.
  const adresse = parseAddress({
    house_number: "330",
    road: "Rue Nicolas Amenin",
    neighbourhood: "Quartier La Paix",
    suburb: "Banco nord",
    city: "Abidjan",
    state: "Abidjan",
    country: "Côte d’Ivoire",
    country_code: "ci",
  });
  assert.deepEqual(adresse, {
    street: "330 Rue Nicolas Amenin",
    neighbourhood: "Quartier La Paix",
    commune: "Banco nord",
    country: "Côte d’Ivoire",
  });
});

test("deux échelons DISJOINTS : le quartier ne réapparaît pas en commune", () => {
  /* Charge réelle d'une recherche « cocody angre abidjan ». Avec une seule
     chaîne de repli, `suburb` aurait servi aux deux champs et la ligne se
     serait lue « Angré · Angré ». */
  const adresse = parseAddress({
    office: "Sodeci – Agence Angré",
    road: "Boulevard André Latrille",
    quarter: "Cité Sicogi 1001 logements",
    suburb: "Angré",
    city: "Abidjan",
    country: "Côte d’Ivoire",
  });
  assert.equal(adresse.street, "Boulevard André Latrille");
  assert.equal(adresse.neighbourhood, "Cité Sicogi 1001 logements");
  assert.equal(adresse.commune, "Angré");
  assert.notEqual(adresse.neighbourhood, adresse.commune);
});

test("sans quartier ni faubourg, la ville tient lieu de commune", () => {
  const adresse = parseAddress({ road: "Rue A", city: "Bouaké", country: "Côte d'Ivoire" });
  assert.equal(adresse.neighbourhood, "");
  assert.equal(adresse.commune, "Bouaké");
});

test("une adresse vide ne devient pas une chaîne d'espaces", () => {
  assert.deepEqual(parseAddress({}), {
    street: "",
    neighbourhood: "",
    commune: "",
    country: "",
  });
  assert.deepEqual(parseAddress(), {
    street: "",
    neighbourhood: "",
    commune: "",
    country: "",
  });
});

test("refuse 0,0 — signature d'un champ vide, pas d'un routeur", () => {
  assert.equal(isValidCoordinate(0, 0), false);
  assert.equal(isValidCoordinate(5.345301, -4.03603), true);
  assert.equal(isValidCoordinate(91, 0), false);
  assert.equal(isValidCoordinate(Number.NaN, 3), false);
});

test("le libellé d'une zone ignore les champs vides", async () => {
  const { routerLocationLabel } = await import("./router-location");
  assert.equal(
    routerLocationLabel({
      locationStreet: "330 Rue Nicolas Amenin",
      locationNeighbourhood: "  ",
      locationCommune: "Abidjan",
      locationCountry: null,
    }),
    "330 Rue Nicolas Amenin · Abidjan",
  );
  assert.equal(routerLocationLabel({}), "");
});
