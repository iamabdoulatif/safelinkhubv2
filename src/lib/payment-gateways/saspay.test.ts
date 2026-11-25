import assert from "node:assert/strict";
import { test } from "node:test";
import { saspayNetwork, normalizeSaspayStatus, buildSaspaySoftpayBody } from "./saspay";

test("saspayNetwork mappe les moyens du portail vers les codes CI", () => {
  assert.equal(saspayNetwork("mtn_money"), "mtn_ci");
  assert.equal(saspayNetwork("moov_money"), "moov_ci");
  assert.equal(saspayNetwork("orange_money"), "orange_ci");
  assert.equal(saspayNetwork("wave"), "wave_ci");
  assert.equal(saspayNetwork("inconnu"), null);
});

test("normalizeSaspayStatus range les statuts dans completed/pending/failed", () => {
  assert.equal(normalizeSaspayStatus("SUCCESS"), "completed");
  assert.equal(normalizeSaspayStatus("pending"), "pending");
  assert.equal(normalizeSaspayStatus("PROCESSING"), "pending");
  assert.equal(normalizeSaspayStatus("FAILED"), "failed");
  assert.equal(normalizeSaspayStatus("CANCELLED"), "failed");
  assert.equal(normalizeSaspayStatus(""), "unknown");
  assert.equal(normalizeSaspayStatus(undefined), "unknown");
});

test("buildSaspaySoftpayBody pose XOF/CI, le réseau, le montant décimal et le téléphone +", () => {
  const body = buildSaspaySoftpayBody(
    {
      reference: "order-123",
      amountFcfa: 2500,
      method: "mtn_money",
      phone: "0708090910",
      description: "Forfait Jour — WiFi",
    },
    "mtn_ci",
  );
  assert.equal(body.amount, "2500.00");
  assert.equal(body.currency, "XOF");
  assert.equal(body.country, "CI");
  assert.equal(body.network, "mtn_ci");
  const customer = body.customer as Record<string, unknown>;
  assert.equal(customer.phone, "+0708090910"); // formatGeniusPayPhone préfixe « + »
  assert.equal(customer.first_name, "Client");
  const metadata = body.metadata as Record<string, unknown>;
  assert.equal(metadata.reference, "order-123");
});
