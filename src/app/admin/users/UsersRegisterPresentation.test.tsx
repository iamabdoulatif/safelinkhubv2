import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { UsersDirectoryIndex } from "./UsersDirectoryIndex";
import { UsersRegisterPriority } from "./UsersRegisterPriority";
import type { OrganizationFocus } from "./organization-focus";

const summary = { attentionCount: 3, freeCount: 18, paidCount: 14, organizationCount: 17 };

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

const filterCounts = { all: 32, admins: 4, superadmins: 1, free: 18, paid: 14, expiring: 3 };

function assertMarkupOrder(markup: string, labels: string[]) {
  const positions = labels.map((label) => markup.indexOf(`>${label}<`));
  positions.forEach((position) => assert.notEqual(position, -1));
  positions.slice(1).forEach((position, index) => assert.ok(positions[index] < position));
}

describe("users register presentation", () => {
  it("renders the global register priorities in order", () => {
    const markup = renderToStaticMarkup(
      <UsersRegisterPriority summary={summary} focusedOrganization={null} />,
    );

    assertMarkupOrder(markup, ["À traiter maintenant", "Quota gratuit", "VPN payant", "Organisations actives"]);
    assert.match(markup, />3</);
    assert.match(markup, /sm:\[&amp;:nth-child\(-n\+2\)\]:border-b-2/);
    assert.match(markup, /sm:\[&amp;:nth-child\(odd\)\]:border-r-2/);
    assert.match(markup, /xl:\[&amp;:nth-child\(-n\+3\)\]:border-r-2/);
  });

  it("renders organization-scoped priorities in order without global totals", () => {
    const markup = renderToStaticMarkup(
      <UsersRegisterPriority summary={summary} focusedOrganization={focus} />,
    );

    assertMarkupOrder(markup, ["Organisation ciblée", "Membres visibles", "Routeurs du parc", "À traiter"]);
    assert.doesNotMatch(markup, />Quota gratuit</);
    assert.doesNotMatch(markup, />Organisations actives</);
  });

  it("renders the controlled directory index controls and their states", () => {
    const markup = renderToStaticMarkup(
      <UsersDirectoryIndex
        query="amine"
        activeFilter="paid"
        resultCount={14}
        filterCounts={filterCounts}
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
    assert.match(markup, /aria-pressed="true" class="[^"]*border-ink bg-ink text-paper/);
    assert.match(markup, /aria-pressed="false" class="[^"]*border-line bg-paper/);
    assert.match(markup, />Tous<span class="font-semibold tabular-nums">32</);
    assert.match(markup, />VPN payant<span class="font-semibold tabular-nums">14</);
    assert.doesNotMatch(markup, /<button[^>]*disabled=""[^>]*>.*Réinitialiser/);

    const resetMarkup = renderToStaticMarkup(
      <UsersDirectoryIndex
        query=""
        activeFilter="all"
        resultCount={32}
        filterCounts={filterCounts}
        filters={filters}
        onQueryChange={() => undefined}
        onFilterChange={() => undefined}
        onReset={() => undefined}
      />,
    );

    assert.match(resetMarkup, /<button[^>]*disabled=""[^>]*>.*Réinitialiser/);
  });
});
