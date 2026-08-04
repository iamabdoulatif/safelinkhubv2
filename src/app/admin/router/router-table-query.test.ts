import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildRouterTableQuery } from "./router-table-query";

describe("paramètres d'URL de la table des routeurs", () => {
  it("conserve la portée, l'organisation et les paramètres non gérés lors du changement des filtres", () => {
    const current = new URLSearchParams(
      "scope=clients&org=d303c049-2675-4d53-a972-c4be95e9d61e&view=metrics&status=offline&status=config&q=ancien&q=obsol%C3%A8te",
    );

    const next = buildRouterTableQuery(current, { status: "online", query: "Bureau principal" });

    assert.equal(next.get("scope"), "clients");
    assert.equal(next.get("org"), "d303c049-2675-4d53-a972-c4be95e9d61e");
    assert.equal(next.get("view"), "metrics");
    assert.deepEqual(next.getAll("status"), ["online"]);
    assert.deepEqual(next.getAll("q"), ["Bureau principal"]);
  });

  it("supprime seulement les filtres gérés quand le statut et la recherche sont effacés", () => {
    const current = new URLSearchParams(
      "scope=clients&org=9b922f5e-eb10-4b63-8460-00d5799cb965&tab=health&status=offline&q=routeur",
    );

    const next = buildRouterTableQuery(current, { status: "all", query: "" });

    assert.equal(next.get("scope"), "clients");
    assert.equal(next.get("org"), "9b922f5e-eb10-4b63-8460-00d5799cb965");
    assert.equal(next.get("tab"), "health");
    assert.equal(next.has("status"), false);
    assert.equal(next.has("q"), false);
  });
});
