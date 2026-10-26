import assert from "node:assert/strict";
import { test } from "node:test";
import { paiementProChannel, paiementProSession, usesPaiementProPortalMethod } from "./paiementpro";

test("paiementProChannel : canaux CI, rien ailleurs", () => {
  assert.equal(paiementProChannel("orange_money", "CI"), "OMCIV2");
  assert.equal(paiementProChannel("mtn_money", "CI"), "MOMOCI");
  assert.equal(paiementProChannel("moov_money", "CI"), "FLOOZ");
  assert.equal(paiementProChannel("wave", "CI"), null);
  assert.equal(paiementProChannel("orange_money", "SN"), null);
});

test("paiementProSession : sessionid des seules URL paiementpro.net", () => {
  assert.equal(
    paiementProSession("https://www.paiementpro.net/webservice/onlinepayment/processing_v2.php?sessionid=abc"),
    "abc",
  );
  assert.equal(paiementProSession("https://evil.example/?sessionid=abc"), null);
});

test("le portail captive les trois moyens mobile money sur PaiementPro", () => {
  assert.equal(usesPaiementProPortalMethod("orange_money"), true);
  assert.equal(usesPaiementProPortalMethod("mtn_money"), true);
  assert.equal(usesPaiementProPortalMethod("moov_money"), true);
  assert.equal(usesPaiementProPortalMethod("wave"), false);
  assert.equal(usesPaiementProPortalMethod("card"), false);
});
