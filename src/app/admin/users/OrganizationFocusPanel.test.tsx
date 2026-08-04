import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { OrganizationFocusPanel } from "./OrganizationFocusPanel";
import UsersControlCenter from "./UsersControlCenter";

const focus = {
  id: "d303c049-2675-4d53-a972-c4be95e9d61e",
  name: "Réseaux du Marché",
  routerTableHref: "/admin/router?scope=clients&org=d303c049-2675-4d53-a972-c4be95e9d61e",
  memberCount: 3,
  routerCounts: { total: 3, online: 1, configuring: 1, offline: 1 },
  routers: [
    {
      id: "9b922f5e-eb10-4b63-8460-00d5799cb965",
      name: "Boutique centrale",
      model: "MikroTik hEX S",
      status: "online",
      activeUsers: 18,
    },
  ],
};

test("le panneau d’organisation ciblée expose les résumés et les parcours de routeurs", () => {
  const markup = renderToStaticMarkup(<OrganizationFocusPanel focus={focus} />);

  assert.match(markup, /Réseaux du Marché/);
  assert.match(markup, /3 utilisateurs/);
  assert.match(markup, /3 routeurs/);
  assert.match(markup, /En ligne\s*:\s*1/);
  assert.match(markup, /En configuration\s*:\s*1/);
  assert.match(markup, /Hors ligne\s*:\s*1/);
  assert.match(markup, /Boutique centrale/);
  assert.match(markup, /MikroTik hEX S/);
  assert.match(markup, /En ligne/);
  assert.match(markup, /18 utilisateurs actifs/);
  assert.match(markup, /href="\/admin\/router\?scope=clients"/);
  assert.match(markup, new RegExp(`href="/admin/router\\?scope=clients&amp;org=${focus.id}"`));
  assert.match(markup, new RegExp(`href="/admin/router/${focus.routers[0].id}"`));
});

test("le panneau d’organisation ciblée explique l’absence de routeur", () => {
  const markup = renderToStaticMarkup(
    <OrganizationFocusPanel
      focus={{
        ...focus,
        id: "f7f48736-0263-40dc-b65f-6b3d8e804e93",
        name: "Association zéro routeur",
        routerTableHref: null,
        routerCounts: { total: 0, online: 0, configuring: 0, offline: 0 },
        routers: [],
      }}
    />,
  );

  assert.match(markup, /Association zéro routeur/);
  assert.match(markup, /0 routeurs/);
  assert.match(markup, /Aucun routeur n’est encore rattaché à cette organisation/);
  assert.match(markup, /href="\/admin\/router\?scope=clients"/);
  assert.doesNotMatch(markup, /Voir la table technique/);
});

test("le panneau utilise la table serveur du parc propre lorsqu’elle est fournie", () => {
  const markup = renderToStaticMarkup(
    <OrganizationFocusPanel
      focus={{
        ...focus,
        id: "org-mine",
        name: "SafeLinkHub",
        routerTableHref: "/admin/router?scope=mine",
      }}
    />,
  );

  assert.match(markup, /href="\/admin\/router\?scope=mine"/);
  assert.doesNotMatch(markup, /href="\/admin\/router\?scope=clients&amp;org=org-mine"/);
});

test("la station de contrôle rend clairement la portée ciblée sans colonne organisation", () => {
  const markup = renderToStaticMarkup(
    <UsersControlCenter
      rows={[
        {
          id: "member-1",
          name: "Awa Traoré",
          email: "awa@example.com",
          orgName: focus.name,
          role: "admin",
          quotaCategory: "default",
          quotaLabel: "Par défaut",
          quotaExpiresAt: null,
          createdAt: "2026-08-04T00:00:00.000Z",
        },
      ]}
      superadmin
      temporaryAccess={null}
      organizationFocus={focus}
    />,
  );

  assert.match(markup, /Utilisateurs de Réseaux du Marché/);
  assert.match(markup, /Utilisateurs de Réseaux du Marché correspondant aux filtres actifs/);
  assert.doesNotMatch(markup, /<th[^>]*>Organisation<\/th>/);
});
