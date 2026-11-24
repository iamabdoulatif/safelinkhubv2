import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveRouterScope } from "./router-scope";

describe("périmètre routeur par site", () => {
  it("admin et superadmin ne sont jamais restreints", () => {
    assert.deepEqual(resolveRouterScope({ role: "admin", assignedSiteIds: ["s1"] }), {
      restricted: false,
    });
    assert.deepEqual(
      resolveRouterScope({ role: "superadmin", assignedSiteIds: ["s1", "s2"] }),
      { restricted: false },
    );
  });

  it("un membre sans site affecté voit tout (org-wide)", () => {
    assert.deepEqual(resolveRouterScope({ role: "editor", assignedSiteIds: [] }), {
      restricted: false,
    });
  });

  it("un membre avec des sites est restreint à ceux-ci", () => {
    assert.deepEqual(
      resolveRouterScope({ role: "editor", assignedSiteIds: ["s1", "s2"] }),
      { restricted: true, siteIds: ["s1", "s2"] },
    );
    assert.deepEqual(resolveRouterScope({ role: "viewer", assignedSiteIds: ["s3"] }), {
      restricted: true,
      siteIds: ["s3"],
    });
  });
});
