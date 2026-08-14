import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadUsersTemporaryAccessPayload } from "./users-temporary-access";

const payloadSource = {
  organizations: [{ id: "org-global", name: "Organisation globale" }],
  routers: [{ id: "router-global", orgId: "org-global" }],
  grants: [{ id: "grant-global", orgId: "org-global" }],
};

describe("users temporary access server boundary", () => {
  it("returns null without loading global data for a focused superadmin", async () => {
    let loadCount = 0;
    const result = await loadUsersTemporaryAccessPayload({
      superadmin: true,
      focusedOrganization: true,
      load: async () => {
        loadCount += 1;
        return payloadSource;
      },
    });

    assert.equal(result, null);
    assert.equal(loadCount, 0);
  });

  it("loads and returns the global payload source for a global superadmin", async () => {
    let loadCount = 0;
    const result = await loadUsersTemporaryAccessPayload({
      superadmin: true,
      focusedOrganization: false,
      load: async () => {
        loadCount += 1;
        return payloadSource;
      },
    });

    assert.strictEqual(result, payloadSource);
    assert.equal(loadCount, 1);
  });

  it("returns null without loading global data for a normal admin", async () => {
    let loadCount = 0;
    const result = await loadUsersTemporaryAccessPayload({
      superadmin: false,
      focusedOrganization: false,
      load: async () => {
        loadCount += 1;
        return payloadSource;
      },
    });

    assert.equal(result, null);
    assert.equal(loadCount, 0);
  });
});
