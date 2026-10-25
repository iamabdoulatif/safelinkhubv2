import assert from "node:assert/strict";
import { test } from "node:test";
import { buildCinetpayChargeBody, cinetpayMethod, normalizeCinetpayStatus } from "./cinetpay";

test("cinetpayMethod : codes CI, null sinon", () => {
  assert.equal(cinetpayMethod("mtn_money"), "MTN_CI");
  assert.equal(cinetpayMethod("moov_money"), "MOOV_CI");
  assert.equal(cinetpayMethod("orange_money"), "OM_CI");
  assert.equal(cinetpayMethod("wave"), "WAVE_CI");
  assert.equal(cinetpayMethod("carte"), null);
});

test("normalizeCinetpayStatus : succès / en attente / échec", () => {
  for (const s of ["SUCCESS", "OK", "ACCEPTED", "success"]) assert.equal(normalizeCinetpayStatus(s), "completed");
  for (const s of ["PENDING", "INITIATED", "WAITING_FOR_CUSTOMER"]) assert.equal(normalizeCinetpayStatus(s), "pending");
  for (const s of ["FAILED", "REFUSED", "OTP_ERROR", "INSUFFICIENT_BALANCE", "EXPIRED"]) assert.equal(normalizeCinetpayStatus(s), "failed");
  assert.equal(normalizeCinetpayStatus(""), "unknown");
  assert.equal(normalizeCinetpayStatus(undefined), "unknown");
});

test("buildCinetpayChargeBody : PUSH direct, bon opérateur, numéro et montant", () => {
  const body = buildCinetpayChargeBody(
    {
      merchantTransactionId: "SLH-ABC123",
      amountFcfa: 1200,
      method: "mtn_money",
      phone: "+2250505562052",
      designation: "Forfait 01-SEMAINE — WiFi",
      notifyUrl: "https://safelinkhub.io/api/payments/cinetpay/webhook?org=x",
      successUrl: "https://safelinkhub.io/portal/paid?o=SLH-ABC123",
      failedUrl: "https://safelinkhub.io/portal/paid?o=SLH-ABC123&status=error",
    },
    cinetpayMethod("mtn_money")!,
  );
  assert.equal(body.channel, "PUSH");
  assert.equal(body.direct_pay, true);
  assert.equal(body.payment_method, "MTN_CI");
  assert.equal(body.client_phone_number, "+2250505562052");
  assert.equal(body.amount, 1200);
  assert.equal(body.currency, "XOF");
  assert.equal(body.merchant_transaction_id, "SLH-ABC123");
});
