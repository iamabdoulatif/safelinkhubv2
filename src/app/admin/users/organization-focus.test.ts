import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveFocusedOrganization } from "./organization-focus";

const organizations = [
  { id: "org-mine", name: "Mon organisation" },
  { id: "org-client", name: "Client Réseau" },
];

describe("organisation ciblée", () => {
  it("sélectionne une organisation connue pour un superadmin", () => {
    assert.deepEqual(resolveFocusedOrganization(true, "org-client", organizations), {
      id: "org-client",
      name: "Client Réseau",
    });
  });

  it("rejette un identifiant absent ou forgé", () => {
    assert.equal(resolveFocusedOrganization(true, null, organizations), null);
    assert.equal(resolveFocusedOrganization(true, "", organizations), null);
    assert.equal(resolveFocusedOrganization(true, "forged-org", organizations), null);
  });

  it("rejette la sélection pour un non-superadmin", () => {
    assert.equal(resolveFocusedOrganization(false, "org-client", organizations), null);
  });
});
