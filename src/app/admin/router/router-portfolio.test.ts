import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildClientPortfolios,
  countRouterStatuses,
  isConfiguringRouter,
  parseRouterPortfolioScope,
} from "./router-portfolio";

describe("portefeuille de routeurs", () => {
  it("classe les statuts online, offline et de configuration", () => {
    assert.equal(isConfiguringRouter("pending"), true);
    assert.equal(isConfiguringRouter("installing"), true);
    assert.equal(isConfiguringRouter("online"), false);
    assert.equal(isConfiguringRouter("error"), false);

    assert.deepEqual(
      countRouterStatuses([
        { status: "online" },
        { status: "pending" },
        { status: "installing" },
        { status: "error" },
      ]),
      { total: 4, online: 1, offline: 1, configuring: 2 },
    );
  });

  it("utilise la portée personnelle par défaut et accepte clients", () => {
    assert.equal(parseRouterPortfolioScope(null), "mine");
    assert.equal(parseRouterPortfolioScope(undefined), "mine");
    assert.equal(parseRouterPortfolioScope("mine"), "mine");
    assert.equal(parseRouterPortfolioScope("clients"), "clients");
  });

  it("exclut sa propre organisation et préserve un client sans routeur", () => {
    const portfolios = buildClientPortfolios({
      ownOrgId: "org-mine",
      organizations: [
        { id: "org-mine", name: "Mon organisation" },
        { id: "org-empty", name: "Bamba Réseau" },
      ],
      memberOrgIds: ["org-empty"],
      routers: [{ orgId: "org-mine", status: "online" }],
    });

    assert.deepEqual(portfolios, [
      {
        id: "org-empty",
        name: "Bamba Réseau",
        memberCount: 1,
        routerCounts: { total: 0, online: 0, offline: 0, configuring: 0 },
      },
    ]);
  });

  it("calcule les comptes client, trie en français et ignore les organisations inconnues", () => {
    const portfolios = buildClientPortfolios({
      ownOrgId: "org-mine",
      organizations: [
        { id: "org-mine", name: "Mon organisation" },
        { id: "org-z", name: "Zéphyr Telecom" },
        { id: "org-e", name: "Éclair Connect" },
        { id: "org-a", name: "Avenir Net" },
      ],
      memberOrgIds: ["org-z", "org-z", "org-e", "unknown-member"],
      routers: [
        { orgId: "org-z", status: "online" },
        { orgId: "org-z", status: "installing" },
        { orgId: "org-e", status: "pending" },
        { orgId: "org-e", status: "disconnected" },
        { orgId: "org-a", status: "online" },
        { orgId: "unknown-router", status: "online" },
      ],
    });

    assert.deepEqual(
      portfolios.map((portfolio) => portfolio.name),
      ["Avenir Net", "Éclair Connect", "Zéphyr Telecom"],
    );
    assert.deepEqual(portfolios[1], {
      id: "org-e",
      name: "Éclair Connect",
      memberCount: 1,
      routerCounts: { total: 2, online: 0, offline: 1, configuring: 1 },
    });
    assert.deepEqual(portfolios[2], {
      id: "org-z",
      name: "Zéphyr Telecom",
      memberCount: 2,
      routerCounts: { total: 2, online: 1, offline: 0, configuring: 1 },
    });
  });
});
