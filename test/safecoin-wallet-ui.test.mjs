import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("la carte client expose les informations Safecoin essentielles", async () => {
  const source = await readFile("src/app/admin/billing/SafecoinWalletCard.tsx", "utf8");
  for (const label of [
    "Solde Safecoin",
    "1 SC =",
    "Ajouter des SC",
    "non retirable",
    "Auto-Setup",
  ]) assert.match(source, new RegExp(label));
});
