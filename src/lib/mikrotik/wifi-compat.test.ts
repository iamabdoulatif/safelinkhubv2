import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { RouterOSClient } from "./client";
import { applySsid, primarySsid, readWifiState } from "./wifi-compat";

type Rows = Record<string, string>[];

/**
 * Faux routeur : `routes` associe une commande à ses lignes, ou à "ERR" quand
 * la commande n'existe pas sur cette board (RouterOS lève alors un !trap).
 * Une commande non listée répond une liste vide, comme un !done sans données —
 * c'est ce que renvoie un vrai RouterOS sur un /set réussi.
 */
function fakeClient(routes: Record<string, Rows | "ERR">) {
  const sent: string[][] = [];
  const client = {
    sent,
    async talk(words: string[]) {
      sent.push(words);
      const res = routes[words[0]];
      if (res === "ERR") throw new Error("no such command");
      return res ?? [];
    },
  };
  return client as unknown as RouterOSClient & { sent: string[][] };
}

// Relevés en production, d'où les valeurs exactes.
const HAP_AX2 = {
  "/interface/wifi/print": [
    { name: "wifi1", "default-name": "wifi1", "configuration.ssid": "DJESSIA WIFI" },
    { name: "wifi2", "default-name": "wifi2", "configuration.ssid": "DJESSIA WIFI" },
  ] as Rows,
  "/interface/wifi/radio/print": [
    { interface: "wifi1", bands: "5ghz-ax" },
    { interface: "wifi2", bands: "2ghz-ax" },
  ] as Rows,
  "/interface/wireless/print": "ERR" as const,
};

const RB951 = {
  // Board legacy : la commande existe et repond une liste VIDE.
  "/interface/wifi/print": [] as Rows,
  "/interface/wireless/print": [{ name: "wlan2", ssid: "YAHYA WIFI", band: "2ghz-b/g/n" }] as Rows,
};

describe("wifi-compat — détection de l'API", () => {
  it("reconnaît une board ax (/interface/wifi)", async () => {
    const state = await readWifiState(fakeClient(HAP_AX2));
    assert.equal(state.api, "wifi");
    assert.equal(state.radios.length, 2);
    assert.equal(primarySsid(state), "DJESSIA WIFI");
    assert.equal(state.radios[0].band5ghz, true);
    assert.equal(state.radios[1].band5ghz, false);
  });

  /**
   * Le piège : sur RB951/RB4011 legacy, `/interface/wifi/print` NE lève PAS
   * d'erreur — il répond une liste vide. Une détection en try/catch conclurait
   * donc « aucun WiFi » sur un routeur qui diffuse bel et bien un SSID, et la
   * restauration laisserait le rechange muet.
   */
  it("bascule sur /interface/wireless quand /interface/wifi répond VIDE", async () => {
    const state = await readWifiState(fakeClient(RB951));
    assert.equal(state.api, "wireless");
    assert.equal(state.radios.length, 1);
    assert.equal(state.radios[0].name, "wlan2");
    assert.equal(primarySsid(state), "YAHYA WIFI");
  });

  it("board sans radio (RB4011iGS+, CCR) : api=none, sans erreur", async () => {
    const state = await readWifiState(
      fakeClient({ "/interface/wifi/print": [], "/interface/wireless/print": "ERR" }),
    );
    assert.equal(state.api, "none");
    assert.equal(state.radios.length, 0);
    assert.equal(primarySsid(state), null);
  });
});

describe("wifi-compat — application du SSID", () => {
  it("board ax : écrit configuration.ssid avec la bande lue sur la radio", async () => {
    const client = fakeClient(HAP_AX2);
    const res = await applySsid(client, "YAHYA WIFI");

    assert.equal(res.api, "wifi");
    assert.deepEqual(res.applied, ["wifi1", "wifi2"]);
    assert.equal(res.failed.length, 0);

    const sets = client.sent.filter((w) => w[0] === "/interface/wifi/set");
    assert.equal(sets.length, 2);
    assert.ok(sets[0].includes("=configuration.ssid=YAHYA WIFI"));
    // wifi1 est la radio 5GHz ICI : la bande vient de /radio/print, pas du nom.
    assert.ok(sets[0].includes("=channel.band=5ghz-ax"));
    assert.ok(sets[1].includes("=channel.band=2ghz-ax"));
  });

  it("board legacy : écrit =ssid= via /interface/wireless/set", async () => {
    const client = fakeClient(RB951);
    const res = await applySsid(client, "MAMBA WIFI");

    assert.equal(res.api, "wireless");
    assert.deepEqual(res.applied, ["wlan2"]);
    const sets = client.sent.filter((w) => w[0] === "/interface/wireless/set");
    assert.equal(sets.length, 1);
    assert.ok(sets[0].includes("=ssid=MAMBA WIFI"));
    // Aucun champ "configuration.*" : la board legacy rejetterait la commande.
    assert.ok(!sets[0].some((w) => w.startsWith("=configuration.")));
  });

  it("board mono-radio : ne suppose pas que wifi1 = 5GHz", async () => {
    // hAP ax lite, confirmé en production : wifi1 est la radio 2.4GHz.
    const client = fakeClient({
      "/interface/wifi/print": [{ name: "wifi1", "default-name": "wifi1" }],
      "/interface/wifi/radio/print": [],
      "/interface/wireless/print": "ERR",
    });
    await applySsid(client, "X");
    const set = client.sent.find((w) => w[0] === "/interface/wifi/set")!;
    assert.ok(set.includes("=channel.band=2ghz-ax"));
  });

  it("board sans radio : signale sans échouer (la restauration continue)", async () => {
    const client = fakeClient({ "/interface/wifi/print": [], "/interface/wireless/print": "ERR" });
    const res = await applySsid(client, "X");
    assert.equal(res.api, "none");
    assert.equal(res.applied.length, 0);
    assert.equal(res.failed.length, 0);
    assert.ok(res.note);
    assert.equal(client.sent.filter((w) => w[0].endsWith("/set")).length, 0);
  });

  it("dryRun n'écrit rien mais annonce les radios visées", async () => {
    const client = fakeClient(HAP_AX2);
    const res = await applySsid(client, "X", { dryRun: true });
    assert.deepEqual(res.applied, ["wifi1", "wifi2"]);
    assert.equal(client.sent.filter((w) => w[0].endsWith("/set")).length, 0);
  });
});
