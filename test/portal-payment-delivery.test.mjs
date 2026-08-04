import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("honore une commande portail en envoyant le SMS par défaut", async () => {
  const source = await readFile("src/lib/portal/fulfill.ts", "utf8");

  assert.match(source, /const sendSms = opts\?\.sendSms \?\? true;/);
});

test("journalise une vérification GeniusPay indisponible", async () => {
  const source = await readFile("src/app/api/portal/[slug]/status/route.ts", "utf8");

  assert.match(source, /\[portal:status\] verification GeniusPay impossible/);
});

test("expose les commandes GeniusPay non confirmées dans l'administration", async () => {
  const source = await readFile("src/app/admin/conversion/page.tsx", "utf8");

  assert.match(source, /Commandes à vérifier/);
  assert.match(source, /failure_reason/);
});
