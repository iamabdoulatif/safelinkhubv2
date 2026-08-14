import assert from "node:assert/strict";
import test from "node:test";
import { findHotspotUser } from "./hotspot-user";

test("does not turn a RouterOS read failure into a missing hotspot user", async () => {
  await assert.rejects(
    findHotspotUser(
      {
        talk: async () => {
          throw new Error("RouterOS unavailable");
        },
      },
      "adamo",
    ),
    /RouterOS unavailable/,
  );
});

test("returns null only when RouterOS confirmed that a hotspot user is absent", async () => {
  const user = await findHotspotUser({ talk: async () => [] }, "adamo");
  assert.equal(user, null);
});
