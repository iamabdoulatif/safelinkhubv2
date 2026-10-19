import React from "react";
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import GeneralSettingsOverview from "./GeneralSettingsOverview";
import { SETTINGS_SECTIONS } from "../sections";
const organization = {
  name: "Organisation de démonstration",
  slug: "demo-org",
  accountType: "operator",
  createdAtLabel: "19 octobre 2026",
};
test("new organization receives a clear first action without treating optional features as failures", () => {
  const html = renderToStaticMarkup(
    <GeneralSettingsOverview
      organization={organization}
      counts={{ routers: 0, gateways: 0, portals: 0, sms: 0 }}
    />,
  );
  assert.match(html, /Lier mon premier routeur/);
  assert.match(html, /Portail par défaut/);
  assert.match(html, /Optionnel/);
  assert.doesNotMatch(
    html,
    /sur 4|Tout est en place pour vendre|Aucun portail|0 %/,
  );
});
test("all real settings destinations and organization identity remain accessible", () => {
  const html = renderToStaticMarkup(
    <GeneralSettingsOverview
      organization={organization}
      counts={{ routers: 13, gateways: 1, portals: 2, sms: 0 }}
    />,
  );
  for (const section of SETTINGS_SECTIONS.filter(
    (s) => s.href !== "/admin/settings/general",
  ))
    assert.ok(html.includes(`href="${section.href}"`), section.label);
  assert.match(html, /13 routeurs liés/);
  assert.match(html, /2 modèles disponibles/);
  assert.match(html, /demo-org/);
  assert.match(html, /19 octobre 2026/);
  assert.match(html, /Copier l&#x27;identifiant/);
});
test("counter failures remain unknown rather than zero or completed", () => {
  const html = renderToStaticMarkup(
    <GeneralSettingsOverview
      organization={organization}
      counts={{ routers: null, gateways: null, portals: null, sms: null }}
    />,
  );
  assert.match(html, /État indisponible/);
  assert.doesNotMatch(
    html,
    /Aucun routeur lié|Lier mon premier routeur|passerelle active/,
  );
});
test("reseller account label is preserved", () => {
  const html = renderToStaticMarkup(
    <GeneralSettingsOverview
      organization={{ ...organization, accountType: "reseller" }}
      counts={{ routers: 1, gateways: 1, portals: 1, sms: 1 }}
    />,
  );
  assert.match(html, /Revendeur/);
});
