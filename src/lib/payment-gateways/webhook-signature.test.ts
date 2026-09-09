import assert from "node:assert/strict";
import test from "node:test";
import { createHmac } from "node:crypto";

import { verifyGeniusWebhookSignature } from "./geniuspay";

// La config est relue à CHAQUE appel (getGeniusPayConfig) : poser l'env ici
// suffit, les tests s'exécutent après l'évaluation du module.
const SECRET = "whsec_test_platform";
process.env.GENIUSPAY_API_KEY = "pk_test";
process.env.GENIUSPAY_API_SECRET = "sk_test";
process.env.GENIUSPAY_WEBHOOK_SECRET = SECRET;

const BODY = JSON.stringify({ event: "payment.success", reference: "REF-1" });
const sign = (ts: string, body = BODY, secret = SECRET) =>
  createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");

const nowSeconds = () => String(Math.floor(Date.now() / 1000));

test("accepte un webhook plateforme fraîchement signé", () => {
  const ts = nowSeconds();
  assert.equal(
    verifyGeniusWebhookSignature({ rawBody: BODY, signature: sign(ts), timestamp: ts }),
    true,
  );
});

test("refuse le rejeu d'un webhook signé il y a plus de 5 minutes", () => {
  const ts = String(Math.floor(Date.now() / 1000) - 6 * 60);
  assert.equal(
    verifyGeniusWebhookSignature({ rawBody: BODY, signature: sign(ts), timestamp: ts }),
    false,
  );
});

test("refuse une signature d'un autre secret", () => {
  const ts = nowSeconds();
  assert.equal(
    verifyGeniusWebhookSignature({
      rawBody: BODY,
      signature: sign(ts, BODY, "whsec_attaquant"),
      timestamp: ts,
    }),
    false,
  );
});

test("refuse un corps modifié après signature", () => {
  const ts = nowSeconds();
  assert.equal(
    verifyGeniusWebhookSignature({
      rawBody: JSON.stringify({ event: "payment.success", reference: "REF-2" }),
      signature: sign(ts),
      timestamp: ts,
    }),
    false,
  );
});

test("refuse un webhook sans signature ni horodatage", () => {
  assert.equal(
    verifyGeniusWebhookSignature({ rawBody: BODY, signature: null, timestamp: null }),
    false,
  );
});
