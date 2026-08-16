import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { migrateMikhmonToFlash } from "./mikhmon-flash";

/** Routeur simulé : un seul conteneur MikHmon, qui démarre au premier essai. */
function routerWithContainer(rootDir: string) {
  const calls: string[][] = [];
  let removed = false;
  const client = {
    async talk(words: string[]) {
      calls.push(words);
      if (words[0] === "/container/print") {
        if (removed) {
          return [
            { ".id": "*2", name: "mikhmon", "root-dir": rootDir, "remote-image": "img:1", interface: "MIKHMON", status: "running" },
          ];
        }
        return [
          { ".id": "*1", name: "mikhmon", "root-dir": rootDir, "remote-image": "img:1", interface: "MIKHMON", status: "stopped" },
        ];
      }
      if (words[0] === "/container/remove") removed = true;
      return [] as Record<string, string>[];
    },
  };
  return { calls, client };
}

describe("réinstallation du conteneur MikHmon", () => {
  it("refuse de toucher un conteneur persistant sans force", async () => {
    const { calls, client } = routerWithContainer("usb1/mikhmon");
    const result = await migrateMikhmonToFlash(client as never, { pollMs: 1 });
    assert.equal(result.status, "already-persistent");
    assert.equal(calls.filter((w) => w[0] === "/container/remove").length, 0);
  });

  it("réinstalle SUR PLACE : un conteneur USB reste sur l'USB", async () => {
    // Le recréer sur la flash interne casserait les boards dont elle est trop
    // petite — hAP ax³, Chateau PRO ax, L009 — qui ont justement besoin de la clé.
    const { calls, client } = routerWithContainer("usb1/mikhmon");
    const result = await migrateMikhmonToFlash(client as never, { force: true, pollMs: 1 });

    assert.equal(result.status, "migrated");
    const add = calls.find((w) => w[0] === "/container/add");
    assert.ok(add, "le conteneur doit être recréé");
    assert.ok(add.includes("=root-dir=usb1/mikhmon"), `emplacement conservé, vu : ${add.join(" ")}`);
    assert.ok(!add.includes("=root-dir=flash/mikhmon-app"));
    // Même interface et même image que l'original.
    assert.ok(add.includes("=interface=MIKHMON"));
    assert.ok(add.includes("=remote-image=img:1"));
  });

  it("migre bien vers la flash un conteneur resté en RAM", async () => {
    const { calls, client } = routerWithContainer("tmp/mikhmon");
    const result = await migrateMikhmonToFlash(client as never, { pollMs: 1 });
    assert.equal(result.status, "migrated");
    const add = calls.find((w) => w[0] === "/container/add");
    assert.ok(add?.includes("=root-dir=flash/mikhmon-app"));
  });

  it("dit clairement qu'il n'y a rien à réinstaller", async () => {
    const client = { async talk() { return [] as Record<string, string>[]; } };
    const result = await migrateMikhmonToFlash(client as never, { force: true, pollMs: 1 });
    assert.equal(result.status, "no-container");
  });

  it("pose les COUCHES sur le même stockage que le conteneur", async () => {
    // Le défaut de HSPT-TOFESSO (L009, 128 Mo de flash) : conteneur sur la clé,
    // couches sur la flash interne. L'extraction remplissait la flash et
    // échouait — « DOWNLOAD/EXTRACT FAILED », puis « rebooted during
    // download/extract, need repull » à chaque redémarrage.
    const { calls, client } = routerWithContainer("usb1/mikhmon-app");
    await migrateMikhmonToFlash(client as never, { force: true, pollMs: 1 });

    const config = calls.find((w) => w[0] === "/container/config/set");
    assert.ok(config, "la configuration du moteur doit être posée");
    assert.ok(
      config.includes("=layer-dir=usb1/mikhmon-layers"),
      `couches sur la clé, vu : ${config.join(" ")}`,
    );
    assert.ok(!config.includes("=layer-dir=flash/mikhmon-layers"));
  });

  it("garde les couches sur la flash quand le conteneur y va", async () => {
    const { calls, client } = routerWithContainer("tmp/mikhmon");
    await migrateMikhmonToFlash(client as never, { pollMs: 1 });
    const config = calls.find((w) => w[0] === "/container/config/set");
    assert.ok(config?.includes("=layer-dir=flash/mikhmon-layers"));
  });
});
