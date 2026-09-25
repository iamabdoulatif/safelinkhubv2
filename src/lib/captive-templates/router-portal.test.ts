import assert from "node:assert/strict";
import test from "node:test";
import { pickRouterPortal } from "./router-portal";

const tpl = [
  { id: "t1", name: "hotspot-sfh1" },
  { id: "t2", name: "SafeLink Baraka — FOUANGA-WIFI" },
  { id: "t3", name: "Autre" },
];

test("le portail enregistré à l'installation prime", () => {
  assert.deepEqual(pickRouterPortal({ id: "r", captiveTemplateId: "t1", ssid: "FOUANGA-WIFI" }, tpl, []), { template: tpl[0], inferred: false });
});

test("repli sur un bridge DE CE routeur, puis sur le SSID de l'auto-setup", () => {
  const links = [{ routerId: "autre", captiveTemplateId: "t3" }];
  // Le bridge d'un AUTRE routeur ne compte pas (l'ancien code comparait les noms).
  assert.equal(pickRouterPortal({ id: "r", captiveTemplateId: null, ssid: "X" }, tpl, links), null);
  assert.deepEqual(
    pickRouterPortal({ id: "r", captiveTemplateId: null, ssid: null }, tpl, [{ routerId: "r", captiveTemplateId: "t3" }]),
    { template: tpl[2], inferred: true },
  );
  assert.deepEqual(pickRouterPortal({ id: "r", captiveTemplateId: null, ssid: "FOUANGA-WIFI" }, tpl, []), { template: tpl[1], inferred: true });
});

test("un identifiant enregistré qui ne correspond plus à rien ne bloque pas le repli", () => {
  assert.deepEqual(pickRouterPortal({ id: "r", captiveTemplateId: "supprimé", ssid: "FOUANGA-WIFI" }, tpl, []), { template: tpl[1], inferred: true });
});
