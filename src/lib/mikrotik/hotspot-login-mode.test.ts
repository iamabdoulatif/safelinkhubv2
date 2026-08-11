import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ensureHotspotLoginByCode } from "./hotspot-login-mode";

type Sentence = string[];

function mockClient(responses: Record<string, Record<string, string>[]>) {
  const recorded: Sentence[] = [];
  const client = {
    talk: async (sentence: Sentence) => {
      recorded.push(sentence);
      return responses[sentence[0]] ?? [];
    },
  };
  return { client, recorded };
}

describe("ensureHotspotLoginByCode", () => {
  it("ajoute les méthodes manquantes SANS retirer l'existant (préserve mac/mac-cookie)", async () => {
    const { client, recorded } = mockClient({
      "/ip/hotspot/print": [{ ".id": "*1", profile: "MAMBA WIFI", disabled: "false" }],
      "/ip/hotspot/profile/print": [
        // manque http-pap ; mac + mac-cookie doivent être conservés (parité RUE-NICOLAS)
        {
          ".id": "*P1",
          name: "MAMBA WIFI",
          "login-by": "mac,cookie,http-chap,mac-cookie",
          "dns-name": "mamba.ci",
          "hotspot-address": "10.0.0.1",
        },
      ],
    });

    const { fixed, loginHost } = await ensureHotspotLoginByCode(client as never);

    assert.deepEqual(fixed, ["MAMBA WIFI"]);
    const set = recorded.find((s) => s[0] === "/ip/hotspot/profile/set");
    assert.ok(set, "un /set doit être émis");
    assert.ok(set.includes("=numbers=*P1"));
    // additif : existant préservé, http-pap ajouté à la fin
    assert.ok(set.includes("=login-by=mac,cookie,http-chap,mac-cookie,http-pap"));
    // host de login live capturé pour l'auto-connexion
    assert.deepEqual(loginHost, { dnsName: "mamba.ci", hotspotAddress: "10.0.0.1" });
  });

  it("complète un profil vide/minimal vers les méthodes code et mac-cookie requises", async () => {
    const { client, recorded } = mockClient({
      "/ip/hotspot/print": [{ ".id": "*1", profile: "NEUF", disabled: "false" }],
      "/ip/hotspot/profile/print": [{ ".id": "*P1", name: "NEUF", "login-by": "http-pap" }],
    });

    const { fixed } = await ensureHotspotLoginByCode(client as never);

    assert.deepEqual(fixed, ["NEUF"]);
    const set = recorded.find((s) => s[0] === "/ip/hotspot/profile/set");
    assert.ok(set, "un /set doit être émis");
    assert.ok(set.includes("=login-by=http-pap,cookie,http-chap,mac-cookie"));
  });

  it("active la création des mac-cookies sur les profils de tickets", async () => {
    const { client, recorded } = mockClient({
      "/ip/hotspot/print": [{ ".id": "*1", profile: "NEUF", disabled: "false" }],
      "/ip/hotspot/profile/print": [
        { ".id": "*P1", name: "NEUF", "login-by": "cookie,http-chap,http-pap,mac-cookie" },
      ],
      "/ip/hotspot/user/profile/print": [
        { ".id": "*U1", name: "01-JOUR", "add-mac-cookie": "false" },
      ],
    });

    await ensureHotspotLoginByCode(client as never);

    const set = recorded.find((sentence) => sentence[0] === "/ip/hotspot/user/profile/set");
    assert.ok(set, "un /set du profil de ticket doit être émis");
    assert.ok(set.includes("=numbers=*U1"));
    assert.ok(set.includes("=add-mac-cookie=yes"));
  });

  it("ne touche à rien quand login-by couvre déjà les trois méthodes (cas MAMBA/RUE-NICOLAS réel)", async () => {
    const { client, recorded } = mockClient({
      "/ip/hotspot/print": [{ ".id": "*1", profile: "RUE-NICOLAS", disabled: "false" }],
      "/ip/hotspot/profile/print": [
        { ".id": "*P1", name: "RUE-NICOLAS", "login-by": "mac,cookie,http-chap,http-pap,mac-cookie" },
      ],
    });

    const { fixed } = await ensureHotspotLoginByCode(client as never);

    assert.deepEqual(fixed, []);
    assert.ok(!recorded.some((s) => s[0] === "/ip/hotspot/profile/set"));
  });

  it("ignore les profils qui ne servent aucun serveur hotspot actif", async () => {
    const { client, recorded } = mockClient({
      // serveur désactivé → son profil ne doit pas être corrigé
      "/ip/hotspot/print": [{ ".id": "*1", profile: "OLD", disabled: "true" }],
      "/ip/hotspot/profile/print": [
        { ".id": "*P1", name: "OLD", "login-by": "http-pap" },
        { ".id": "*P2", name: "ORPHAN", "login-by": "http-pap" },
      ],
    });

    const { fixed } = await ensureHotspotLoginByCode(client as never);

    assert.deepEqual(fixed, []);
    assert.ok(!recorded.some((s) => s[0] === "/ip/hotspot/profile/set"));
  });

  it("ne fait rien quand le routeur n'a aucun serveur hotspot", async () => {
    const { client, recorded } = mockClient({
      "/ip/hotspot/print": [],
      "/ip/hotspot/profile/print": [],
    });

    const { fixed } = await ensureHotspotLoginByCode(client as never);

    assert.deepEqual(fixed, []);
    assert.ok(!recorded.some((s) => s[0] === "/ip/hotspot/profile/set"));
  });
});
