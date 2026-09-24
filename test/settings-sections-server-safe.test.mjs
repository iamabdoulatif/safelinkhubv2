import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";

// Une page serveur ne peut pas lire une valeur exportée d'un module "use client" :
// elle reçoit une référence client (bug prod : SETTINGS_SECTIONS.filter).
test("la liste des sections des paramètres vit hors du module client", async () => {
  const sections = await readFile(new URL("../src/app/admin/settings/sections.ts", import.meta.url), "utf8");
  assert.doesNotMatch(sections, /^"use client"/m);
  const page = await readFile(new URL("../src/app/admin/settings/general/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(page, /from "\.\.\/SettingsTabs"/);
});
