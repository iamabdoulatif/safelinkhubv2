import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("la réponse de statut affiche le code sans attendre la passerelle SMS", async () => {
  const source = await readFile("src/app/api/portal/[slug]/status/route.ts", "utf8");

  assert.match(source, /fulfillPortalOrder\(order\.id, \{ sendSms: false \}\)/);
  assert.match(source, /queuePortalTicketSms\(order\.id\)/);
});

test("le webhook GeniusPay signé confirme la commande portail sans re-polling", async () => {
  const source = await readFile("src/app/api/payments/geniuspay/webhook/route.ts", "utf8");

  assert.match(source, /verifyOrgGeniusWebhookSignature/);
  assert.match(source, /confirmSignedPortalPaymentByReference/);
});

test("chaque organisation conserve le secret de son webhook GeniusPay chiffré", async () => {
  const [schema, migration, gateway] = await Promise.all([
    readFile("src/lib/db/schema.ts", "utf8"),
    readFile("scripts/add-geniuspay-org-webhook-secret.sql", "utf8"),
    readFile("src/lib/payment-gateways/geniuspay-org.ts", "utf8"),
  ]);

  assert.match(schema, /webhookSecretEncrypted: text\("webhook_secret_encrypted"\)/);
  assert.match(migration, /add column if not exists webhook_secret_encrypted text/);
  assert.match(gateway, /webhookSecretEncrypted: encryptSecret/);
});
