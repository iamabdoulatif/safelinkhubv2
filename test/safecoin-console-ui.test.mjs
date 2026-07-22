import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("la station Safecoin expose les rapports et filtres essentiels", async () => {
  const source = await readFile("src/app/admin/safecoin/SafecoinConsole.tsx", "utf8");
  for (const label of ["Station de contrôle", "SC émis", "SC consommés", "Frais", "Exporter CSV", "Rechercher"]) {
    assert.match(source, new RegExp(label));
  }
});
