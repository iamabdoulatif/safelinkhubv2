import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { AUTOSETUP_STEPS, stepStatus } from "./autosetup-steps";

test("une étape est faite, en cours ou à venir selon l'étape du serveur", () => {
  assert.equal(stepStatus("connect", "network"), "done");
  assert.equal(stepStatus("network", "network"), "active");
  assert.equal(stepStatus("reboot", "network"), "pending");
  // Avant le premier sondage, ou étape inconnue : rien n'est coché d'office.
  assert.equal(stepStatus("connect", null), "pending");
  assert.equal(stepStatus("connect", "done"), "pending");
});

test("le moteur signale ses étapes dans l'ordre que l'écran affiche", async () => {
  /* L'écran coche tout ce qui PRÉCÈDE l'étape courante. Un step() déplacé
     dans provisionHotspotStack sans mettre à jour AUTOSETUP_STEPS ferait
     cocher des étapes qui n'ont pas encore tourné. */
  const src = await readFile(new URL("./container-setup.ts", import.meta.url), "utf8");
  const appels = [...src.matchAll(/await step\("(\w+)"\)/g)].map((m) => m[1]);
  assert.deepEqual(appels, [...AUTOSETUP_STEPS]);
});
