import assert from "node:assert/strict";
import { test } from "node:test";
import { regulationApplyGuard } from "./regulation-apply-guard";

test("observation never reaches the router or mutates the enforcement state", () => {
  for (const body of [{ dryRun: true }, { observationOnly: true }, { mode: "observation" }]) {
    assert.equal(regulationApplyGuard(body, true, false)?.status, 200);
    assert.equal(regulationApplyGuard(body, true, false)?.body.applied, false);
  }
});
test("disabled regulation and v2 configuration cannot execute legacy commands", () => {
  assert.equal(regulationApplyGuard({}, false, false)?.status, 409);
  assert.equal(regulationApplyGuard({}, true, true)?.status, 409);
  assert.equal(regulationApplyGuard({}, true, false), null);
});
