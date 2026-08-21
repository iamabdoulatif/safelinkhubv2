import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ClientPortfolioGrid } from "./ClientPortfolioGrid";
import { RouterPortfolioTabs } from "./RouterPortfolioTabs";
import { adminFr } from "@/lib/i18n/admin/fr";

test("les onglets de portefeuille exposent les deux portées et la portée active", () => {
  const mineMarkup = renderToStaticMarkup(
    <RouterPortfolioTabs activeScope="mine" t={adminFr.network.routers.tabs} />,
  );
  const clientsMarkup = renderToStaticMarkup(
    <RouterPortfolioTabs activeScope="clients" t={adminFr.network.routers.tabs} />,
  );

  assert.match(mineMarkup, /href="\/admin\/router\?scope=mine"/);
  assert.match(mineMarkup, /href="\/admin\/router\?scope=clients"/);
  assert.match(mineMarkup, />Mon parc<\/a>/);
  assert.match(mineMarkup, />Parcs clients<\/a>/);
  assert.equal((mineMarkup.match(/aria-current="page"/g) ?? []).length, 1);
  assert.match(mineMarkup, /aria-current="page"[^>]*>Mon parc<\/a>/);
  assert.match(clientsMarkup, /aria-current="page"[^>]*>Parcs clients<\/a>/);
});

test("une organisation cliente affiche chaque compteur d’état et ses deux actions", () => {
  const clientId = "d303c049-2675-4d53-a972-c4be95e9d61e";
  const markup = renderToStaticMarkup(
    <ClientPortfolioGrid
      t={adminFr.network.routers.clients}
      clients={[
        {
          id: clientId,
          name: "Réseaux du Marché",
          memberCount: 3,
          routerCounts: { total: 7, online: 4, configuring: 2, offline: 1 },
        },
      ]}
    />,
  );

  assert.match(markup, /Réseaux du Marché/);
  assert.match(markup, /3 membres/);
  assert.match(markup, /7 routeurs/);
  assert.match(markup, /En ligne\s*:\s*4/);
  assert.match(markup, /En configuration\s*:\s*2/);
  assert.match(markup, /Hors ligne\s*:\s*1/);
  assert.match(markup, /Ouvrir l’organisation/);
  assert.match(markup, /Voir les routeurs/);
  assert.deepEqual(
    [...markup.matchAll(/<a\b[^>]*href="([^"]+)"/g)].map((match) => match[1]),
    [
      `/admin/users?org=${clientId}`,
      `/admin/router?scope=clients&amp;org=${clientId}`,
    ],
  );
});

test("une organisation cliente sans routeur conserve un total nul et ses actions", () => {
  const clientId = "9b922f5e-eb10-4b63-8460-00d5799cb965";
  const markup = renderToStaticMarkup(
    <ClientPortfolioGrid
      t={adminFr.network.routers.clients}
      clients={[
        {
          id: clientId,
          name: "Association zéro routeur",
          memberCount: 1,
          routerCounts: { total: 0, online: 0, configuring: 0, offline: 0 },
        },
      ]}
    />,
  );

  assert.match(markup, /0 routeurs/);
  assert.match(markup, new RegExp(`/admin/users\\?org=${clientId}`));
  assert.match(markup, new RegExp(`/admin/router\\?scope=clients&amp;org=${clientId}`));
});

test("une liste cliente vide explique qu’aucune organisation cliente n’est disponible", () => {
  const markup = renderToStaticMarkup(
    <ClientPortfolioGrid clients={[]} t={adminFr.network.routers.clients} />,
  );

  assert.match(markup, /Aucune organisation cliente disponible/);
});
