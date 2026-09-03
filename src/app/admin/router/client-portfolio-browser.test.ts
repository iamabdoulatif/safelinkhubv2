import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  filterAndSortClients,
  normalizeSearch,
  summarizePortfolios,
  type PortfolioSort,
} from "./client-portfolio-browser";
import type { ClientPortfolio } from "./router-portfolio";

const mk = (name: string, total: number, online: number, offline: number): ClientPortfolio => ({
  id: name,
  name,
  memberCount: 1,
  routerCounts: { total, online, configuring: total - online - offline, offline },
});

const clients = [
  mk("Nébié-Services", 3, 1, 2),
  mk("Kirowoza", 0, 0, 0),
  mk("AKR-IT-NETWORK", 5, 5, 0),
];

describe("recherche insensible aux accents", () => {
  it("« nebie » retrouve « Nébié-Services »", () => {
    assert.equal(normalizeSearch("Nébié"), "nebie");
    const r = filterAndSortClients(clients, "nebie", "name");
    assert.deepEqual(r.map((c) => c.name), ["Nébié-Services"]);
  });
  it("requête vide = tous", () => {
    assert.equal(filterAndSortClients(clients, "", "name").length, 3);
    assert.equal(filterAndSortClients(clients, "   ", "name").length, 3);
  });
  it("aucune correspondance = liste vide", () => {
    assert.equal(filterAndSortClients(clients, "zzz", "name").length, 0);
  });
});

describe("tri", () => {
  it("par nom (accents ignorés)", () => {
    assert.deepEqual(
      filterAndSortClients(clients, "", "name").map((c) => c.name),
      ["AKR-IT-NETWORK", "Kirowoza", "Nébié-Services"],
    );
  });
  it("par nombre de routeurs décroissant", () => {
    assert.deepEqual(
      filterAndSortClients(clients, "", "routers").map((c) => c.routerCounts.total),
      [5, 3, 0],
    );
  });
  it("hors ligne d'abord met en tête ceux qui demandent une action", () => {
    assert.equal(filterAndSortClients(clients, "", "offline")[0].name, "Nébié-Services");
  });
  it("ne mute pas le tableau d'entrée", () => {
    const before = clients.map((c) => c.name);
    filterAndSortClients(clients, "", "routers" as PortfolioSort);
    assert.deepEqual(clients.map((c) => c.name), before);
  });
});

describe("résumé agrégé", () => {
  it("somme organisations / routeurs / en ligne / hors ligne", () => {
    assert.deepEqual(summarizePortfolios(clients), {
      organizations: 3,
      routers: 8,
      online: 6,
      offline: 2,
    });
  });
});
