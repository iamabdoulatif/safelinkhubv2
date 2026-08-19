import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { syncProfilePriceOnRouter, PROFILE_UNIT_FROM_PACKAGE } from "./price-sync";

// Le crochet de roaming dérive sa clé d'AUTH_SECRET (lu à l'appel, pas à
// l'import). Sans lui, la resynchronisation lèverait — ce qui est le bon
// comportement en production, où le secret existe toujours.
process.env.AUTH_SECRET ||= "secret-de-test-pour-la-derivation";

const ROAM_FRAGMENT = ':do { /tool fetch url="https://safelinkhub.io/api/roaming/seen" } on-error={}';

function routerWithProfile(onLogin: string) {
  const calls: string[][] = [];
  const client = {
    async talk(words: string[]) {
      calls.push(words);
      if (words[0] === "/ip/hotspot/user/profile/print") {
        return [{ ".id": "*7", name: "01-MOIS", "on-login": onLogin }];
      }
      return [] as Record<string, string>[];
    },
  };
  return { calls, client };
}

const base = {
  profileName: "01-MOIS",
  durationValue: 1,
  durationUnit: "Months",
  priceCents: 2500,
  routerId: "11111111-2222-3333-4444-555555555555",
};

describe("resynchronisation du prix sur le routeur", () => {
  it("réécrit le tarif inscrit dans le script du profil", async () => {
    const { calls, client } = routerWithProfile(':put (",remc,2000,30d,2000,")');
    const result = await syncProfilePriceOnRouter(client as never, base);

    assert.equal(result.updated, true);
    const set = calls.find((w) => w[0] === "/ip/hotspot/user/profile/set");
    assert.ok(set, "le profil doit être mis à jour");
    const onLogin = set.find((w) => w.startsWith("=on-login="))!;
    // Le nouveau tarif remplace l'ancien, partout où il est inscrit.
    assert.match(onLogin, /,2500,30d,2500,/);
    assert.doesNotMatch(onLogin, /,2000,30d,2000,/);
    assert.match(onLogin, /-\|-2500-\|-/);
  });

  it("PRÉSERVE le crochet de roaming quand il était là", async () => {
    // Réécrire le on-login sans le remettre casserait l'auto-login inter-zones.
    const { calls, client } = routerWithProfile(`:put (",remc,2000,30d,2000,") ${ROAM_FRAGMENT}`);
    const result = await syncProfilePriceOnRouter(client as never, base);

    assert.equal(result.updated && result.keptRoamingHook, true);
    const set = calls.find((w) => w[0] === "/ip/hotspot/user/profile/set")!;
    const onLogin = set.find((w) => w.startsWith("=on-login="))!;
    assert.match(onLogin, /api\/roaming\/seen/, "le crochet doit être réappliqué");
    assert.match(onLogin, /,2500,30d,2500,/, "et le tarif corrigé");
  });

  it("n'ajoute PAS de crochet là où il n'y en avait pas", async () => {
    const { calls, client } = routerWithProfile(':put (",remc,2000,30d,2000,")');
    await syncProfilePriceOnRouter(client as never, base);
    const set = calls.find((w) => w[0] === "/ip/hotspot/user/profile/set")!;
    assert.ok(!set.join(" ").includes("api/roaming/seen"));
  });

  it("ne touche à rien si le profil n'existe pas sur le routeur", async () => {
    const calls: string[][] = [];
    const client = {
      async talk(words: string[]) {
        calls.push(words);
        return [] as Record<string, string>[];
      },
    };
    const result = await syncProfilePriceOnRouter(client as never, base);
    assert.equal(result.updated, false);
    assert.equal(calls.filter((w) => w[0] === "/ip/hotspot/user/profile/set").length, 0);
  });

  it("refuse une unité de durée qu'il ne sait pas traduire", async () => {
    const { client } = routerWithProfile(':put (",remc,2000,30d,2000,")');
    const result = await syncProfilePriceOnRouter(client as never, { ...base, durationUnit: "Lunes" });
    assert.equal(result.updated, false);
    assert.equal(PROFILE_UNIT_FROM_PACKAGE["Months"], "mo");
  });
});
