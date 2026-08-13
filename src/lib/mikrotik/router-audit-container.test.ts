import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { auditRouter } from "./router-audit";

/**
 * Le seul point qui nous intéresse ici : l'état du conteneur MikHmon.
 *
 * RouterOS ≤7.22 rapporte « status » ; 7.23+ l'a remplacé par le booléen
 * « running ». L'audit ne testait que le second — sur un routeur en 7.19 il
 * déclarait donc « Conteneur MikHmon arrêté » quoi qu'il arrive, et envoyait
 * l'opérateur chercher une panne qui n'existait pas.
 */
function routerWith(container: Record<string, string>) {
  return {
    async talk(words: string[]) {
      if (words[0] === "/container/print") return [container];
      // Tout le reste de l'audit : rien à signaler.
      return [] as Record<string, string>[];
    },
  };
}

const mikhmonFindings = (audit: Awaited<ReturnType<typeof auditRouter>>) =>
  audit.findings.filter((finding) => finding.area === "MikHmon");

describe("audit — état du conteneur MikHmon", () => {
  it("voit un conteneur qui tourne sur RouterOS 7.19 (propriété « status »)", async () => {
    const audit = await auditRouter(
      routerWith({ ".id": "*1", name: "mikhmon", status: "running", "root-dir": "usb1/mikhmon" }) as never,
    );
    const ids = mikhmonFindings(audit).map((finding) => finding.id);
    assert.ok(ids.includes("mikhmon-running"), "doit constater que le conteneur tourne");
    assert.ok(!ids.includes("mikhmon-stopped"), "et surtout ne pas le déclarer arrêté");
  });

  it("voit un conteneur qui tourne sur RouterOS 7.23 (booléen « running »)", async () => {
    const audit = await auditRouter(
      routerWith({ ".id": "*1", name: "mikhmon", running: "true", "root-dir": "usb1/mikhmon" }) as never,
    );
    const ids = mikhmonFindings(audit).map((finding) => finding.id);
    assert.ok(ids.includes("mikhmon-running"));
    assert.ok(!ids.includes("mikhmon-stopped"));
  });

  it("signale un conteneur réellement arrêté, avec un bouton pour le démarrer", async () => {
    for (const container of [
      { ".id": "*1", name: "mikhmon", status: "stopped", "root-dir": "usb1/mikhmon" },
      { ".id": "*1", name: "mikhmon", running: "false", "root-dir": "usb1/mikhmon" },
    ]) {
      const audit = await auditRouter(routerWith(container) as never);
      const stopped = mikhmonFindings(audit).find((finding) => finding.id === "mikhmon-stopped");
      assert.ok(stopped, "un conteneur arrêté doit être signalé");
      assert.equal(stopped.severity, "error");
      assert.equal(stopped.fix, "mikhmon-start", "et proposer de le démarrer en un clic");
    }
  });

  it("le dit quand RouterOS ne rapporte aucun état, au lieu de conclure", async () => {
    const audit = await auditRouter(
      routerWith({ ".id": "*1", name: "mikhmon", "root-dir": "usb1/mikhmon" }) as never,
    );
    const ids = mikhmonFindings(audit).map((finding) => finding.id);
    assert.ok(ids.includes("mikhmon-status"), "état inconnu ≠ arrêté");
    assert.ok(!ids.includes("mikhmon-stopped"));
  });
});
