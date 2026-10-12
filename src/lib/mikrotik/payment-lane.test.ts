import assert from "node:assert/strict";
import { test } from "node:test";
import { paymentLaneScriptLines, paymentLaneUser } from "./payment-lane";

test("paymentLaneUser : dérivé du MAC, sans séparateurs", () => {
  assert.equal(paymentLaneUser("5A:AC:A9:24:BF:63"), "pay-5aaca924bf63");
});

test("paymentLaneScriptLines : profil, sondes en FWD, accept avant reject, en tête du forward", () => {
  const lines = paymentLaneScriptLines(["188.114.96.2"], "safelinkhub-walled-garden");
  const script = lines.join("\n");
  assert.match(script, /user profile add name="slh-paiement" address-list="slh-paiement" session-timeout=15m/);
  assert.match(script, /dns static add name="captive\.apple\.com" type=FWD .*address-list="slh-paiement-ok"/);
  assert.match(script, /address-list add list="slh-paiement-ok" address=188\.114\.96\.2/);
  // Ajout inversé : le reject est ajouté AVANT les accept pour finir DERRIÈRE eux.
  const reject = lines.findIndex((l) => l.includes("action=reject"));
  const acceptWg = lines.findIndex((l) => l.includes('dst-address-list="safelinkhub-walled-garden" action=accept'));
  assert.ok(reject >= 0 && acceptWg > reject);
  assert.ok(lines.filter((l) => l.includes("place-before=")).length === 3);
});
