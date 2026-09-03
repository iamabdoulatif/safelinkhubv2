import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AppRouterContext,
  type AppRouterInstance,
} from "next/dist/shared/lib/app-router-context.shared-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import UsersControlCenter from "./UsersControlCenter";
import { UsersDirectoryIndex } from "./UsersDirectoryIndex";
import { UsersRegisterPriority } from "./UsersRegisterPriority";
import type { OrganizationFocus } from "./organization-focus";
import type { UserControlRow } from "./users-control-center";

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

const controlCenterRows: UserControlRow[] = [
  {
    id: "user-awa",
    name: "Awa Traoré",
    email: "awa@example.com",
    orgName: "Atelier Réseau Abidjan",
    role: "admin",
    quotaCategory: "paid",
    quotaLabel: "VPN payant",
    quotaExpiresAt: null,
    createdAt: "2026-07-01T00:00:00.000Z",
  },
];

const appRouter: AppRouterInstance = {
  back: () => undefined,
  forward: () => undefined,
  refresh: () => undefined,
  push: () => undefined,
  replace: () => undefined,
  prefetch: () => undefined,
};

function assertMarkupOrder(markup: string, labels: string[]) {
  const positions = labels.map((label) => markup.indexOf(`>${label}<`));
  positions.forEach((position) => assert.notEqual(position, -1));
  positions.slice(1).forEach((position, index) => assert.ok(positions[index] < position));
}

function priorityCellClassTokens(markup: string) {
  return Array.from(markup.matchAll(/<div class="([^"]*min-w-0[^"]*)">/g), ([, className]) => new Set(className.split(" ")));
}

function openingTagsWithClassTokens(markup: string, tagName: "div" | "span", requiredTokens: string[]) {
  return Array.from(markup.matchAll(new RegExp(`<${tagName}\\b[^>]*>`, "g"))).flatMap((match) => {
    const className = match[0].match(/\bclass="([^"]*)"/)?.[1];
    if (!className || match.index === undefined) return [];
    const classTokens = new Set(className.split(/\s+/).filter(Boolean));
    if (!requiredTokens.every((token) => classTokens.has(token))) return [];
    return [{ tag: match[0], index: match.index }];
  });
}

describe("users register presentation", () => {
  it("places register priorities and the directory before temporary access", () => {
    const markup = renderToStaticMarkup(
      <UsersControlCenter
        rows={controlCenterRows}
        superadmin
        temporaryAccess={{
          organizations: [{ id: "org-1", name: "Atelier Réseau Abidjan", slug: "atelier-reseau" }],
          routers: [],
          grants: [],
        }}
        organizationFocus={null}
      />,
    );

    const priorityPosition = markup.indexOf('aria-label="Repères du registre"');
    // Ancré sur l'annuaire lui-même : l'en-tête « Personne » appartenait à la
    // table, remplacée par une liste. L'ordre des sections, lui, n'a pas changé.
    const personPosition = markup.indexOf('aria-label="Utilisateurs correspondant aux filtres actifs"');
    const temporaryAccessPosition = markup.indexOf(">Passes d’accès temporaire<");

    assert.notEqual(priorityPosition, -1);
    assert.notEqual(personPosition, -1);
    assert.notEqual(temporaryAccessPosition, -1);
    assert.ok(priorityPosition < personPosition);
    assert.ok(personPosition < temporaryAccessPosition);

    /* L'identité n'est plus rendue DEUX fois (une carte mobile + une ligne de
       table) : la liste est unique à toutes les tailles. C'est une garantie
       plus forte que l'ancienne — plus de duplication à maintenir en phase,
       et un lecteur d'écran n'entend plus chaque personne deux fois. */
    const monogrammes = openingTagsWithClassTokens(markup, "span", ["h-10", "w-10", "border"]).filter(
      ({ tag, index }) => markup.slice(index + tag.length).startsWith("AT</span>"),
    );
    assert.equal(monogrammes.length, 1, "l'identité est rendue une seule fois");
    monogrammes.forEach(({ tag }) => assert.match(tag, /\saria-hidden="true"(?:\s|>)/));

    // La liste porte l'intitulé de portée (ex-<caption> de la table).
    assert.match(markup, /aria-label="Utilisateurs correspondant aux filtres actifs"/);
  });

  it("does not render global temporary access details in an organization focus", () => {
    const markup = renderToStaticMarkup(
      <AppRouterContext.Provider value={appRouter}>
        <UsersControlCenter
          rows={controlCenterRows}
          superadmin
          temporaryAccess={{
            organizations: [{ id: "foreign-org", name: "Organisation étrangère", slug: "organisation-etrangere" }],
            routers: [{ id: "foreign-router", name: "Routeur étranger", orgId: "foreign-org" }],
            grants: [
              {
                id: "foreign-grant",
                orgId: "foreign-org",
                orgName: "Organisation étrangère",
                orgSlug: "organisation-etrangere",
                routerId: "foreign-router",
                routerName: "Routeur étranger",
                services: [],
                durationKey: "hour_1",
                startsAt: new Date("2026-08-04T09:00:00.000Z"),
                expiresAt: new Date("2026-08-04T10:00:00.000Z"),
                status: "active",
                reason: "support",
                note: "Donnée hors périmètre",
                createdAt: new Date("2026-08-04T09:00:00.000Z"),
                revokedAt: null,
                revokeReason: null,
              },
            ],
          }}
          organizationFocus={focus}
        />
      </AppRouterContext.Provider>,
    );

    assert.equal(markup.includes(">Passes d’accès temporaire<"), false);
    assert.equal(markup.includes("Organisation étrangère"), false);
  });

  it("renders the global register priorities in order", () => {
    const markup = renderToStaticMarkup(
      <UsersRegisterPriority summary={summary} focusedOrganization={null} />,
    );

    assertMarkupOrder(markup, ["À traiter maintenant", "Quota gratuit", "VPN payant", "Organisations actives"]);
    assert.match(markup, />3</);
    const priorityCells = priorityCellClassTokens(markup);
    assert.equal(priorityCells.length, 4);
    const [first, second, third, fourth] = priorityCells;
    assert.ok(first.has("border-b"));
    assert.ok(second.has("border-b"));
    assert.ok(third.has("border-b"));
    assert.equal(fourth.has("border-b"), false);
    assert.ok(first.has("sm:border-r"));
    assert.equal(first.has("sm:border-b-0"), false);
    assert.equal(second.has("sm:border-r"), false);
    assert.equal(second.has("sm:border-b-0"), false);
    assert.ok(third.has("sm:border-r"));
    assert.ok(third.has("sm:border-b-0"));
    assert.equal(fourth.has("sm:border-r"), false);
    assert.equal(fourth.has("sm:border-b-0"), false);
    assert.ok(second.has("xl:border-r"));
    assert.ok(third.has("xl:border-r"));
    assert.ok(first.has("xl:border-b-0"));
    assert.ok(second.has("xl:border-b-0"));
    assert.ok(third.has("sm:border-b-0"));
    assert.equal(fourth.has("xl:border-r"), false);
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
    assert.match(markup, /<label class="[^"]*focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ink/);
    assert.match(markup, />14 affichés</);
    assert.match(markup, /aria-live="polite"/);
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
