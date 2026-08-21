import test from "node:test";
import assert from "node:assert/strict";

test("the admin catalog provides a finance copy slice", async () => {
  const [{ adminFr }, { adminEn }] = await Promise.all([
    import("../src/lib/i18n/admin/fr.ts"),
    import("../src/lib/i18n/admin/en.ts"),
  ]);

  for (const dict of [adminFr, adminEn]) {
    assert.ok(dict.finance, "finance copy is required");
    for (const screen of ["sales", "transactions", "expenses"]) {
      assert.ok(dict.finance[screen], `finance.${screen} is required`);
    }
  }
});
