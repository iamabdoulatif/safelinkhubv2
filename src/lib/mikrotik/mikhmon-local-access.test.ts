import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ensureMikhmonLocalAccess } from "./mikhmon-local-access";

type Row = Record<string, string>;

/**
 * Le passage de réconciliation de la synchro appelle cette fonction sur TOUT le
 * parc. Sur un routeur hotspot SANS conteneur MikHmon, elle ne doit poser aucune
 * règle (sinon dst-nat mort + accepts walled-garden inertes), mais quand même
 * renvoyer la passerelle pour que l'appelant marque le routeur traité.
 */
describe("ensureMikhmonLocalAccess — garde conteneur", () => {
  function fakeClient(containers: Row[]) {
    const calls: string[][] = [];
    return {
      calls,
      talk: async (words: string[]) => {
        calls.push(words);
        if (words[0] === "/ip/hotspot/print") return [{ interface: "HOTSPOT" }];
        if (words[0] === "/ip/address/print") return [{ address: "10.0.0.1/24" }];
        if (words[0] === "/container/print") return containers;
        return [] as Row[];
      },
      close: () => {},
    };
  }

  it("aucun conteneur MikHmon : passerelle renvoyée, zéro règle posée", async () => {
    const client = fakeClient([{ name: "pihole", "root-dir": "/pihole" }]);
    const r = await ensureMikhmonLocalAccess(client as never);
    assert.equal(r.gateway, "10.0.0.1");
    assert.equal(r.natAdded, false);
    assert.equal(r.walledGardenAdded, false);
    assert.equal(r.containerWalledGardenAdded, false);
    assert.match(r.note ?? "", /conteneur MikHmon/i);
    assert.equal(client.calls.some((w) => w[0].endsWith("/add")), false);
  });

  it("hotspot + conteneur + état vierge : pose le dst-nat pre-hotspot (client connecté)", async () => {
    const calls: string[][] = [];
    const client = {
      talk: async (words: string[]) => {
        calls.push(words);
        if (words[0] === "/ip/hotspot/print") return [{ interface: "HOTSPOT" }];
        if (words[0] === "/ip/address/print") return [{ address: "10.0.0.1/24" }];
        if (words[0] === "/container/print") return [{ name: "mikhmonv3-safelinkhub", interface: "MIKHMON", status: "running" }];
        if (words[0] === "/interface/veth/print") return [{ address: "11.11.11.11/28" }];
        return [] as Row[]; // nat/print, walled-garden/print → vides → tout à poser
      },
      close: () => {},
    };
    const r = await ensureMikhmonLocalAccess(client as never);
    assert.equal(r.preHotspotNatAdded, true);
    const preHotspotAdd = calls.find(
      (w) => w[0] === "/ip/firewall/nat/add" && w.includes("=chain=pre-hotspot"),
    );
    assert.ok(preHotspotAdd, "un dst-nat pre-hotspot doit être posé");
    assert.ok(preHotspotAdd!.includes("=to-addresses=11.11.11.11"));
    assert.ok(preHotspotAdd!.includes("=dst-port=8087"));
  });

  it("pas de hotspot : rien à ouvrir, pas de lecture de conteneur", async () => {
    const client = {
      calls: [] as string[][],
      talk: async (words: string[]) => {
        (client.calls as string[][]).push(words);
        return [] as Row[]; // /ip/hotspot/print vide → pas de passerelle
      },
    };
    const r = await ensureMikhmonLocalAccess(client as never);
    assert.equal(r.gateway, null);
    assert.equal(client.calls.some((w) => w[0] === "/container/print"), false);
  });
});
