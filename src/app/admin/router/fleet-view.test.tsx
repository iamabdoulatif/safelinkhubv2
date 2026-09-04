import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import {
  PathnameContext,
  SearchParamsContext,
} from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import RoutersTable, { type RouterRow } from "./RoutersTable";
import { adminFr } from "@/lib/i18n/admin/fr";

const appRouter = {
  back() {}, forward() {}, refresh() {}, hmrRefresh() {},
  push() {}, replace() {}, prefetch() {},
};

function zone(over: Partial<RouterRow> & { id: string }): RouterRow {
  return {
    name: `ZONE-${over.id}`,
    model: "hAP ax³",
    host: "10.0.0.1",
    apiPort: 8728,
    status: "online",
    cpuLoad: 5,
    memoryUsage: "41",
    activeUsers: 45,
    lastSyncAtMs: Date.now() - 14 * 60 * 1000,
    connectionMethod: "wireguard",
    ...over,
  };
}

function rendu(routers: RouterRow[], params = new URLSearchParams()) {
  return renderToStaticMarkup(
    <AppRouterContext.Provider value={appRouter}>
      <PathnameContext.Provider value="/admin/router">
        <SearchParamsContext.Provider value={params}>
          <RoutersTable routers={routers} t={adminFr.network.routers} locale="fr" />
        </SearchParamsContext.Provider>
      </PathnameContext.Provider>
    </AppRouterContext.Provider>,
  );
}

const onze = [
  ...Array.from({ length: 10 }, (_, i) => zone({ id: `on-${i}` })),
  zone({ id: "kalam", name: "HSPT-KALAM", status: "offline", lastSyncAtMs: Date.now() - 10 * 60 * 1000 }),
];

test("un parc de 11 zones dont une muette nomme la zone à surveiller et sa disponibilité", () => {
  const markup = rendu(onze);

  assert.match(markup, /1 routeur demande votre attention/);
  assert.match(markup, /HSPT-KALAM/);
  assert.match(markup, /90,9 %/);
  // L'action du routeur muet est le diagnostic, pas la consultation de fiche.
  assert.match(markup, /href="\/admin\/router\/kalam\?tab=diagnostic"/);
});

test("un parc entièrement en ligne le dit au lieu d'afficher une alerte vide", () => {
  const markup = rendu([zone({ id: "a" }), zone({ id: "b" })]);

  assert.match(markup, /Tout fonctionne correctement/);
  assert.doesNotMatch(markup, /demande votre attention/);
  assert.match(markup, /100 %/);
  assert.doesNotMatch(markup, /tab=diagnostic/);
});

test("un parc entièrement muet garde une disponibilité de 0 % et une zone d'attention", () => {
  const markup = rendu([
    zone({ id: "a", status: "offline" }),
    zone({ id: "b", status: "offline" }),
  ]);

  assert.match(markup, /2 routeurs demandent votre attention/);
  assert.match(markup, /0 %/);
});

test("un parc vide n'affiche ni bande d'état ni zone d'attention, seulement l'amorce", () => {
  const markup = rendu([]);

  assert.doesNotMatch(markup, /Disponibilité/);
  assert.doesNotMatch(markup, /Tout fonctionne correctement/);
  assert.match(markup, /Aucun routeur lié/);
  assert.match(markup, /Lier un MikroTik/);
});

test("un nom à rallonge est tronqué, jamais déversé hors de la carte", () => {
  const markup = rendu([zone({ id: "long", name: "HOTSPOT-ABIDJAN-COCODY-ANGRE-8E-TRANCHE-BATIMENT-C-ETAGE-3" })]);

  // La troncature est portée par la classe, pas par une découpe du texte :
  // le nom complet reste sélectionnable et lisible par un lecteur d'écran.
  assert.match(markup, /HOTSPOT-ABIDJAN-COCODY-ANGRE-8E-TRANCHE-BATIMENT-C-ETAGE-3/);
  assert.match(markup, /truncate[^"]*"[^>]*>HOTSPOT-ABIDJAN/);
});

test("une recherche sans résultat propose de revenir en arrière", () => {
  const markup = rendu(onze, new URLSearchParams("q=inexistant"));

  assert.match(markup, /Aucun résultat/);
  assert.match(markup, /Réinitialiser la recherche/);
});

test("le kill-switch ne s'affiche plus en clair dans la liste", () => {
  const markup = rendu([zone({ id: "a", locked: true })]);

  // Verrouiller coupe tous les ports d'un client : l'action vit dans le menu ⋮,
  // qui ne rend son contenu qu'une fois ouvert.
  assert.doesNotMatch(markup, />Verrouiller</);
  // L'ÉTAT verrouillé, lui, reste visible : c'est une information, pas une action.
  assert.match(markup, /Verrouillé/);
});
