import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const portalLocaleModule = new URL("../src/lib/i18n/portal/locale.ts", import.meta.url);

test("the portal locale accepts only supported values and persists in its URL", async () => {
  assert.equal(
    existsSync(fileURLToPath(portalLocaleModule)),
    true,
    "the captive portal must expose its shared locale helper",
  );

  const { portalLocale, withPortalLocale } = await import(portalLocaleModule.href);

  assert.equal(portalLocale("en"), "en");
  assert.equal(portalLocale("fr"), "fr");
  assert.equal(portalLocale("EN"), "fr");
  assert.equal(portalLocale(undefined), "fr");
  assert.equal(
    withPortalLocale("/portal/pay?orderId=o1", "en"),
    "/portal/pay?orderId=o1&lang=en",
  );
  assert.equal(withPortalLocale("/portal/paid", "fr"), "/portal/paid?lang=fr");
});
