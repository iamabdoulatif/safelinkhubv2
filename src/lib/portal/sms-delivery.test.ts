import assert from "node:assert/strict";
import test from "node:test";
import {
  PORTAL_SMS_RETRY_DELAY_MS,
  shouldAttemptPortalSms,
} from "./sms-delivery";

test("réessaie un SMS non envoyé", () => {
  assert.equal(
    shouldAttemptPortalSms({ status: "failed", lastAttemptAt: null }),
    true,
  );
});

test("ne renvoie pas un SMS déjà envoyé", () => {
  assert.equal(
    shouldAttemptPortalSms({ status: "sent", lastAttemptAt: null }),
    false,
  );
});

test("attend une minute entre deux tentatives", () => {
  const now = new Date("2026-07-22T14:00:00.000Z");
  const recent = new Date(now.getTime() - PORTAL_SMS_RETRY_DELAY_MS + 1);
  const old = new Date(now.getTime() - PORTAL_SMS_RETRY_DELAY_MS);
  assert.equal(shouldAttemptPortalSms({ status: "failed", lastAttemptAt: recent, now }), false);
  assert.equal(shouldAttemptPortalSms({ status: "failed", lastAttemptAt: old, now }), true);
});
