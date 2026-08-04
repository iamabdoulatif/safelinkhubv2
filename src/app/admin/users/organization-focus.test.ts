import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  resolveFocusedOrganization,
  resolveOrganizationFocusQuery,
  resolveFocusedRouterTableHref,
} from "./organization-focus";

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

  it("n’applique le prédicat utilisateur qu’à une organisation autorisée", () => {
    const validFocus = resolveOrganizationFocusQuery(true, "org-client", organizations);
    const forgedFocus = resolveOrganizationFocusQuery(true, "forged-org", organizations);
    const nonSuperadminFocus = resolveOrganizationFocusQuery(false, "org-client", organizations);

    assert.equal(validFocus.userOrgId, "org-client");
    assert.deepEqual(validFocus.organization, organizations[1]);
    assert.equal(forgedFocus.userOrgId, null);
    assert.equal(forgedFocus.organization, null);
    assert.equal(nonSuperadminFocus.userOrgId, null);
    assert.equal(nonSuperadminFocus.organization, null);
  });

  it("ne propose une table technique que pour le parc propre ou un client éligible", () => {
    assert.equal(
      resolveFocusedRouterTableHref({
        organization: organizations[0],
        ownOrganizationId: "org-mine",
        memberCount: 0,
        routerCount: 0,
      }),
      "/admin/router?scope=mine",
    );
    assert.equal(
      resolveFocusedRouterTableHref({
        organization: organizations[1],
        ownOrganizationId: "org-mine",
        memberCount: 1,
        routerCount: 0,
      }),
      "/admin/router?scope=clients&org=org-client",
    );
    assert.equal(
      resolveFocusedRouterTableHref({
        organization: organizations[1],
        ownOrganizationId: "org-mine",
        memberCount: 0,
        routerCount: 0,
      }),
      null,
    );
  });
});
