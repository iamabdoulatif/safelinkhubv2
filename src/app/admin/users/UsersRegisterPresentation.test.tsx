import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { UsersDirectoryIndex } from "./UsersDirectoryIndex";
import { UsersRegisterPriority } from "./UsersRegisterPriority";
import type { OrganizationFocus } from "./organization-focus";

const summary = {
  attentionCount: 3,
  freeCount: 18,
  paidCount: 14,
  organizationCount: 17,
};

const focus: OrganizationFocus = {
  id: "org-1",
  name: "Atelier Réseau Abidjan",
  routerTableHref: "/admin/router?scope=clients&org=org-1",
  memberCount: 12,
  routerCounts: { total: 4, online: 3, offline: 1, configuring: 0 },
  routers: [],
};

const filters = [
  { value: "all" as const, label: "Tous" },
  { value: "paid" as const, label: "VPN payant" },
];

describe("users register presentation", () => {
  it("renders the global register priorities", () => {
    const markup = renderToStaticMarkup(
      <UsersRegisterPriority summary={summary} focusedOrganization={null} />,
    );

    for (const label of ["À traiter maintenant", "Quota gratuit", "VPN payant", "Organisations actives", "3"]) {
      assert.match(markup, new RegExp(`>${label}<`));
    }
  });

  it("renders organization-scoped priorities without global totals", () => {
    const markup = renderToStaticMarkup(
      <UsersRegisterPriority summary={summary} focusedOrganization={focus} />,
    );

    assert.match(markup, />Membres visibles</);
    assert.match(markup, />Routeurs du parc</);
    assert.doesNotMatch(markup, />Quota gratuit</);
    assert.doesNotMatch(markup, />Organisations actives</);
  });

  it("renders the controlled directory index controls", () => {
    const markup = renderToStaticMarkup(
      <UsersDirectoryIndex
        query="amine"
        activeFilter="paid"
        resultCount={14}
        filterCounts={{ all: 32, admins: 4, superadmins: 1, free: 18, paid: 14, expiring: 3 }}
        filters={filters}
        onQueryChange={() => undefined}
        onFilterChange={() => undefined}
        onReset={() => undefined}
      />,
    );

    assert.match(markup, /aria-label="Rechercher un utilisateur"/);
    assert.match(markup, />14 affichés</);
    assert.match(markup, /Réinitialiser/);
    assert.match(markup, /aria-label="Filtres utilisateurs"/);
  });
});
