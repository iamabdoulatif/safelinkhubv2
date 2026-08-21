import test from "node:test";
import assert from "node:assert/strict";

test("the admin dictionaries expose a router-network text slice", async () => {
  const [{ adminFr }, { adminEn }] = await Promise.all([
    import("../src/lib/i18n/admin/fr.ts"),
    import("../src/lib/i18n/admin/en.ts"),
  ]);

  for (const dict of [adminFr, adminEn]) {
    assert.ok("network" in dict, "network text is required for network workflows");
    assert.ok(dict.network.routers, "network.routers is required for the router fleet UI");
  }
});
