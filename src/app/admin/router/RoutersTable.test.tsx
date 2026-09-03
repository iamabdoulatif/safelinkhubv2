import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import {
  PathnameContext,
  SearchParamsContext,
} from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import RoutersTable from "./RoutersTable";
import { adminEn } from "@/lib/i18n/admin/en";
import { adminFr } from "@/lib/i18n/admin/fr";

const router = {
  back() {},
  forward() {},
  refresh() {},
  hmrRefresh() {},
  push() {},
  replace() {},
  prefetch() {},
};

test("la vue ciblée conserve son CTA de liaison lorsque les actions de parc sont masquées", () => {
  const markup = renderToStaticMarkup(
    <AppRouterContext.Provider value={router}>
      <PathnameContext.Provider value="/admin/router">
        <SearchParamsContext.Provider value={new URLSearchParams()}>
          <RoutersTable routers={[]} showFleetActions={false} t={adminFr.network.routers} locale="fr" />
        </SearchParamsContext.Provider>
      </PathnameContext.Provider>
    </AppRouterContext.Provider>,
  );

  assert.equal((markup.match(/Lier un MikroTik/g) ?? []).length, 1);
  assert.doesNotMatch(markup, /Synchroniser/);
  assert.doesNotMatch(markup, /Sauvegardes/);
});

test("la table peut utiliser un titre de second niveau sous le titre de page", () => {
  const markup = renderToStaticMarkup(
    <AppRouterContext.Provider value={router}>
      <PathnameContext.Provider value="/admin/router">
        <SearchParamsContext.Provider value={new URLSearchParams()}>
          <RoutersTable
            routers={[]}
            title="Mon parc SafeLinkHub"
            headingLevel="h2"
            t={adminFr.network.routers}
            locale="fr"
          />
        </SearchParamsContext.Provider>
      </PathnameContext.Provider>
    </AppRouterContext.Provider>,
  );

  assert.match(markup, /<h2[^>]*>Mon parc SafeLinkHub<\/h2>/);
  assert.doesNotMatch(markup, /<h1[^>]*>Mon parc SafeLinkHub<\/h1>/);
});

test("the router table renders English controls without changing router identities", () => {
  const markup = renderToStaticMarkup(
    <AppRouterContext.Provider value={router}>
      <PathnameContext.Provider value="/admin/router">
        <SearchParamsContext.Provider value={new URLSearchParams()}>
          <RoutersTable
            routers={[{
              id: "router-1",
              name: "ABIDJAN-GUEST-01",
              model: "hAP ax2",
              host: "10.0.0.1",
              apiPort: 8728,
              status: "online",
              cpuLoad: 18,
              memoryUsage: "42",
              activeUsers: 4,
              lastSyncAtMs: Date.now(),
              connectionMethod: "wireguard",
            }]}
            t={adminEn.network.routers}
            locale="en"
          />
        </SearchParamsContext.Provider>
      </PathnameContext.Provider>
    </AppRouterContext.Provider>,
  );

  assert.match(markup, />MikroTik routers</);
  assert.match(markup, /Search by name, IP, identity or location/);
  assert.match(markup, />Online</);
  assert.match(markup, /ABIDJAN-GUEST-01/);
  // Une zone sans adresse le DIT, au lieu de laisser une case vide qu'on
  // prendrait pour un défaut d'affichage.
  assert.match(markup, />Location</);
  assert.match(markup, />not set</);
});

test("la localisation d'une zone s'affiche dans la liste et se cherche", () => {
  const zone = {
    id: "router-2",
    name: "SHIA ROAM",
    model: "hAP ax3",
    host: "10.0.0.2",
    apiPort: 8728,
    status: "online",
    cpuLoad: 10,
    memoryUsage: "30",
    activeUsers: 2,
    lastSyncAtMs: Date.now(),
    connectionMethod: "wireguard",
    location: "330 Rue Nicolas Amenin · Quartier La Paix · Banco nord",
  };
  const rendu = (params: URLSearchParams) =>
    renderToStaticMarkup(
      <AppRouterContext.Provider value={router}>
        <PathnameContext.Provider value="/admin/router">
          <SearchParamsContext.Provider value={params}>
            <RoutersTable routers={[zone]} t={adminEn.network.routers} locale="en" />
          </SearchParamsContext.Provider>
        </PathnameContext.Provider>
      </AppRouterContext.Provider>,
    );

  assert.match(rendu(new URLSearchParams()), /Quartier La Paix/);
  // Chercher un quartier doit ramener la zone : c'est la question qu'on se
  // pose devant un parc (« qu'est-ce que j'ai à Banco nord ? »).
  assert.match(rendu(new URLSearchParams("q=banco")), /SHIA ROAM/);
  assert.doesNotMatch(rendu(new URLSearchParams("q=cocody")), /SHIA ROAM/);
});
