import assert from "node:assert/strict";
import { test } from "node:test";
import { mikhmonLegacyDecrypt, mikhmonLegacyEncrypt } from "./mikhmon-session";

test("chiffre legacy MikHmon : aller-retour, 1234 d'usine, v2 indéchiffrable", () => {
  assert.equal(mikhmonLegacyDecrypt("aWNlbA=="), "1234");
  assert.equal(mikhmonLegacyDecrypt(mikhmonLegacyEncrypt("ee7btFGuTVjV")), "ee7btFGuTVjV");
  assert.equal(mikhmonLegacyDecrypt("v2:abc"), null);
});
