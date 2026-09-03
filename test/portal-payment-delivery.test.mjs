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
  // La requête vit dans la page, l'affichage dans la vue : une commande dont
  // le paiement n'est pas confirmé doit rester VISIBLE quelque part, sinon
  // elle disparaît entre « pas encaissée » et « jamais vérifiée ».
  const page = await readFile("src/app/admin/conversion/page.tsx", "utf8");
  assert.match(page, /failure_reason/);
  assert.match(page, /status <> 'fulfilled'/);

  const vue = await readFile("src/app/admin/conversion/ConversionView.tsx", "utf8");
  assert.match(vue, /À vérifier/);
  assert.match(vue, /pendingPayments\.map/);
});
