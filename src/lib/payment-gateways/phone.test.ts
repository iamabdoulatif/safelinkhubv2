import assert from "node:assert/strict";
import test from "node:test";
import { formatGeniusPayCustomer, formatGeniusPayPhone } from "./phone";

test("envoie un numéro GeniusPay au format international E.164", () => {
  assert.equal(formatGeniusPayPhone("2250576619957"), "+2250576619957");
  assert.equal(formatGeniusPayPhone("+225 05 76 61 99 57"), "+2250576619957");
  assert.equal(formatGeniusPayPhone("002250576619957"), "+2250576619957");
});

test("rejette une valeur vide", () => {
  assert.equal(formatGeniusPayPhone("---"), "");
});

test("conserve le pays ISO2 pour le routage GeniusPay", () => {
  assert.deepEqual(
    formatGeniusPayCustomer({ phone: "2250576619957", country: "CI" }),
    { phone: "+2250576619957", country: "CI" },
  );
});
