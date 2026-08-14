import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const workspacePath = new URL("../src/app/admin/remote-access/[id]/page.tsx", import.meta.url);
const directAccessPath = new URL("../src/app/admin/remote-access/DirectAccessSection.tsx", import.meta.url);

test("l’espace routeur borne chaque opération à l’organisation de la session", async () => {
  const source = await readFile(workspacePath, "utf8");
  assert.match(source, /eq\(routers\.id, id\)/);
  assert.match(source, /eq\(routers\.orgId, session\.orgId\)/);
  assert.match(source, /notFound\(\)/);
  assert.match(source, /<DirectAccessSection/);
  assert.match(source, /<BackToHomeSection/);
  assert.match(source, /<Ipv6BypassSection/);
  assert.match(source, /<RouterReplacementSection/);
});

test("les changements d’accès direct passent par une confirmation nommée", async () => {
  const source = await readFile(directAccessPath, "utf8");
  assert.match(source, /const \[confirmation, setConfirmation\]/);
  assert.match(source, /Confirmer l’activation/);
  assert.match(source, /Confirmer la révocation/);
  assert.match(source, /role="dialog"/);
});
