import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MIKHMON_DEFAULT_PASSWORD_ENC,
  adminPortsToBlock,
  generateMikhmonPassword,
  replaceDefaultMikhmonAdmin,
} from "./hardening";

test("le mot de passe d'usine MikHmon chiffré vaut aWNlbA==", () => {
  assert.equal(MIKHMON_DEFAULT_PASSWORD_ENC, "aWNlbA==");
});

test("adminPortsToBlock : jamais 80/443 (portail), WebFig sur port dédié inclus", () => {
  assert.equal(adminPortsToBlock([85, 443]), "21,22,23,85,8291,8728,8729");
  assert.equal(adminPortsToBlock([80, 443]), "21,22,23,8291,8728,8729");
});

test("replaceDefaultMikhmonAdmin : ne touche qu'au mot de passe d'usine", () => {
  const def = "<?php\n$data['mikhmon'] = array ('1'=>'mikhmon<|<mikhmon','2'=>'mikhmon>|>aWNlbA==');\n$data['S'] = array();";
  const out = replaceDefaultMikhmonAdmin(def, "Secret1");
  assert.ok(out && !out.includes("aWNlbA==") && out.includes("$data['S']"));
  const perso = def.replace("aWNlbA==", "v2:abc");
  assert.equal(replaceDefaultMikhmonAdmin(perso, "x"), null);
});

test("generateMikhmonPassword : 12 caractères sans ambiguïté", () => {
  const p = generateMikhmonPassword((n) => new Uint8Array(n).map((_, i) => i * 37));
  assert.equal(p.length, 12);
  assert.ok(!/[0O1lI]/.test(p));
});
