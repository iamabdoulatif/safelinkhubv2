import assert from "node:assert/strict";
import { test } from "node:test";
import { sameRoamingProfile } from "./issuance-snapshot";
const before = {
  durationValue: 1,
  durationUnit: "Days",
  uploadMbps: 5,
  downloadMbps: 10,
  defaultPriceCents: 200,
};
test("a concurrent change of duration, speed or price invalidates issuance", () => {
  assert.equal(sameRoamingProfile(before, { ...before }), true);
  for (const change of [
    { durationValue: 2 },
    { durationUnit: "Hours" },
    { uploadMbps: 10 },
    { downloadMbps: 20 },
    { defaultPriceCents: 0 },
  ])
    assert.equal(sameRoamingProfile(before, { ...before, ...change }), false);
});
