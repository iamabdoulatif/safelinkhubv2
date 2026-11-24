import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveRouterScope, routerInScope } from "./router-scope";

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

describe("routerInScope", () => {
  it("non restreint → tout routeur est dans le périmètre (même non rangé)", () => {
    assert.equal(routerInScope({ restricted: false }, "s1"), true);
    assert.equal(routerInScope({ restricted: false }, null), true);
  });

  it("restreint → seulement les routeurs rangés dans un site autorisé", () => {
    const scope = { restricted: true as const, siteIds: ["s1", "s2"] };
    assert.equal(routerInScope(scope, "s1"), true);
    assert.equal(routerInScope(scope, "s2"), true);
    assert.equal(routerInScope(scope, "s3"), false); // autre agence
    assert.equal(routerInScope(scope, null), false); // non rangé → hors périmètre
  });
});
