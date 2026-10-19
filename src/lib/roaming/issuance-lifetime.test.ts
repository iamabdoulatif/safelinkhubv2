import assert from "node:assert/strict";
import { test } from "node:test";
import {
  roamingIssuanceIsLive,
  ROAMING_ISSUANCE_DEADLINE_MS,
  ROAMING_RECOVERY_AFTER_MS,
} from "./issuance-lifetime";
test("stale reservations become recoverable after the bounded issuance deadline", () => {
  const now = Date.now();
  assert.ok(ROAMING_RECOVERY_AFTER_MS > ROAMING_ISSUANCE_DEADLINE_MS);
  assert.equal(
    roamingIssuanceIsLive("PROVISIONING", new Date(now - 60_000), now),
    true,
  );
  assert.equal(
    roamingIssuanceIsLive(
      "PROVISIONING",
      new Date(now - ROAMING_RECOVERY_AFTER_MS),
      now,
    ),
    false,
  );
  assert.equal(
    roamingIssuanceIsLive("PROVISIONING_ERROR", new Date(now), now),
    false,
  );
});
