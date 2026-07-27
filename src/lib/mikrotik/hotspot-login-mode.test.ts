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
  it("réécrit login-by quand le profil actif est incomplet", async () => {
    const { client, recorded } = mockClient({
      "/ip/hotspot/print": [{ ".id": "*1", profile: "MAMBA WIFI", disabled: "false" }],
      "/ip/hotspot/profile/print": [
        { ".id": "*P1", name: "MAMBA WIFI", "login-by": "http-pap" },
      ],
    });

    const { fixed } = await ensureHotspotLoginByCode(client as never);

    assert.deepEqual(fixed, ["MAMBA WIFI"]);
    const set = recorded.find((s) => s[0] === "/ip/hotspot/profile/set");
    assert.ok(set, "un /set doit être émis");
    assert.ok(set.includes("=numbers=*P1"));
    assert.ok(set.includes("=login-by=cookie,http-chap,http-pap"));
  });

  it("ne touche à rien quand login-by couvre déjà les trois méthodes", async () => {
    const { client, recorded } = mockClient({
      "/ip/hotspot/print": [{ ".id": "*1", profile: "RUE-NICOLAS", disabled: "false" }],
      "/ip/hotspot/profile/print": [
        { ".id": "*P1", name: "RUE-NICOLAS", "login-by": "cookie,http-chap,http-pap,mac" },
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
