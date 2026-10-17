import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";

const lire = (p: string) => readFile(new URL(`../../../../../${p}`, import.meta.url), "utf8");

test("le dialogue MikHmon expose la variante C et ses états de sécurité", async () => {
  const vue = await lire("src/app/admin/router/[id]/MikhmonCredentialsDialog.tsx");
  assert.match(vue, /role="dialog"/);
  assert.match(vue, /aria-modal="true"/);
  assert.match(vue, /Identifiants MikHmon/);
  assert.match(vue, /Réinitialisation d'urgence/);
  assert.match(vue, /Restaurer le mot de passe 1234/);
  assert.match(vue, /Confirmation requise/);
  assert.match(vue, /Mot de passe actuel/);
});
