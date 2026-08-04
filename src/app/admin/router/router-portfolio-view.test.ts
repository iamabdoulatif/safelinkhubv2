import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  resolveRouterPortfolioView,
  type ClientPortfolio,
} from "./router-portfolio";

const clients: ClientPortfolio[] = [
  {
    id: "client-a",
    name: "Avenir Net",
    memberCount: 2,
    routerCounts: { total: 3, online: 2, offline: 1, configuring: 0 },
  },
  {
    id: "client-b",
    name: "Bamba Réseau",
    memberCount: 1,
    routerCounts: { total: 0, online: 0, offline: 0, configuring: 0 },
  },
];

describe("sélection de la vue du portefeuille de routeurs", () => {
  it("n’autorise une flotte cliente que lorsqu’elle appartient aux portefeuilles construits par le serveur", () => {
    assert.deepEqual(resolveRouterPortfolioView({ scope: undefined, orgId: undefined, clients }), {
      kind: "own-fleet",
    });
    assert.deepEqual(resolveRouterPortfolioView({ scope: "unexpected", orgId: "client-a", clients }), {
      kind: "own-fleet",
    });
    assert.deepEqual(resolveRouterPortfolioView({ scope: "clients", orgId: undefined, clients }), {
      kind: "client-cards",
    });
    assert.deepEqual(resolveRouterPortfolioView({ scope: "clients", orgId: "client-b", clients }), {
      kind: "client-fleet",
      client: clients[1],
    });
    assert.deepEqual(resolveRouterPortfolioView({ scope: "clients", orgId: "forged-org", clients }), {
      kind: "client-cards",
    });
    assert.deepEqual(resolveRouterPortfolioView({ scope: "clients", orgId: "org-mine", clients }), {
      kind: "client-cards",
    });
  });
});
