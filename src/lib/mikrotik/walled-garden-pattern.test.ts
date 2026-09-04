import test from "node:test";
import assert from "node:assert/strict";
import {
  dstHostPattern,
  dstHostPatternForScript,
  walledGardenHosts,
  walledGardenScriptLines,
} from "./walled-garden";

test("un joker devient une expression régulière valide pour RouterOS", () => {
  // « *.genius.ci » n'est pas une regex valide : le * ne répète rien, RouterOS
  // refuse l'entrée. C'est le défaut qui laissait le walled-garden incomplet.
  assert.equal(dstHostPattern("*.genius.ci"), String.raw`.*\.genius\.ci`);
  // Les points du domaine sont échappés : sinon « genius-ci » passerait aussi.
  assert.equal(dstHostPattern("*.moov-africa.com"), String.raw`.*\.moov-africa\.com`);
});

test("un hôte concret n'est pas touché", () => {
  assert.equal(dstHostPattern("pay.genius.ci"), "pay.genius.ci");
  assert.equal(dstHostPattern("safelinkhub.io"), "safelinkhub.io");
});

test("aucun joker ne survit dans la liste posée sur le routeur", () => {
  const hosts = walledGardenHosts("safelinkhub.io");
  assert.ok(hosts.includes("safelinkhub.io"), "l'app reste en clair");
  assert.ok(hosts.includes(String.raw`.*\.safelinkhub\.io`), "ses sous-domaines aussi");
  assert.deepEqual(
    hosts.filter((h) => h.startsWith("*")),
    [],
    "plus aucune entrée que RouterOS refuserait",
  );
});

test("dans un script RouterOS, chaque antislash est doublé", () => {
  // Entre guillemets, RouterOS lit « \\. » comme une séquence d'échappement.
  assert.equal(dstHostPatternForScript("*.genius.ci"), String.raw`.*\\.genius\\.ci`);
  const script = walledGardenScriptLines("safelinkhub.io");
  assert.ok(script.includes(String.raw`dst-host=".*\\.safelinkhub\\.io"`));
  assert.ok(!script.includes('dst-host="*.'), "aucun joker dans le bootstrap non plus");
});
