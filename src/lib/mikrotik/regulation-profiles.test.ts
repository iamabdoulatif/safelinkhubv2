import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyRegulation, scaleRateLimit } from "./regulation";

describe("scaleRateLimit", () => {
  it("garde la forme up/down et l'ordre upload/download", () => {
    assert.equal(scaleRateLimit("4M/3M", 50), "2000k/1500k");
    assert.equal(scaleRateLimit("1M/3M", 25), "250k/750k");
    assert.equal(scaleRateLimit("64k/64k", 10), "64k/64k"); // plancher 64k
  });
  it("laisse tranquille les formes étendues (burst) et le vide", () => {
    assert.equal(scaleRateLimit("4M/3M 8M/6M 4M/3M 10/10", 50), null);
    assert.equal(scaleRateLimit("", 50), null);
  });
});

/** Routeur simulé : un hotspot, deux profils, aucune file de régulation. */
function fakeRouter() {
  const profiles: Record<string, string> = { "01-JOUR": "2M/5M", "01-MOIS": "3M/10M" };
  const calls: string[][] = [];
  const client = {
    talk: async (words: string[]) => {
      calls.push(words);
      const cmd = words[0];
      if (cmd === "/ip/hotspot/print") return [{ interface: "HOTSPOT" }];
      if (cmd === "/queue/simple/print") return [];
      if (cmd === "/ip/hotspot/user/profile/print")
        return Object.entries(profiles).map(([name, rl], i) => ({ ".id": `*${i}`, name, "rate-limit": rl }));
      if (cmd === "/ip/hotspot/user/profile/set") {
        const id = Number(words[1].replace("=numbers=*", ""));
        const rl = words.find((w) => w.startsWith("=rate-limit="))?.slice(12);
        if (rl !== undefined) profiles[Object.keys(profiles)[id]] = rl;
      }
      return [];
    },
    close() {},
  };
  return { profiles, calls, client: client as never };
}

describe("applyRegulation — bridage des profils", () => {
  it("bride à pct % de l'ORIGINE, ne dégrade pas deux fois, puis rétablit", async () => {
    const r = fakeRouter();
    // freinage 1 : 50 %
    let out = await applyRegulation(r.client, { limit: "5M/20M", blocks: [], profileThrottlePct: 50, profileLimits: {} });
    assert.deepEqual(r.profiles, { "01-JOUR": "1000k/2500k", "01-MOIS": "1500k/5000k" });
    assert.deepEqual(out.profileLimits, { "01-JOUR": "2M/5M", "01-MOIS": "3M/10M" });
    // freinage 2, même pct, mémoire renvoyée par n8n : rien ne bouge (pas de 25 %)
    out = await applyRegulation(r.client, { limit: "5M/20M", blocks: [], profileThrottlePct: 50, profileLimits: out.profileLimits });
    assert.deepEqual(r.profiles, { "01-JOUR": "1000k/2500k", "01-MOIS": "1500k/5000k" });
    // retour à la normale : origine reposée, mémoire vidée
    out = await applyRegulation(r.client, { limit: "0/0", blocks: [], profileThrottlePct: 50, profileLimits: out.profileLimits });
    assert.deepEqual(r.profiles, { "01-JOUR": "2M/5M", "01-MOIS": "3M/10M" });
    assert.deepEqual(out.profileLimits, {});
  });
  it("pct = 0 : les profils ne sont jamais touchés", async () => {
    const r = fakeRouter();
    const out = await applyRegulation(r.client, { limit: "5M/20M", blocks: [], profileThrottlePct: 0, profileLimits: {} });
    assert.deepEqual(r.profiles, { "01-JOUR": "2M/5M", "01-MOIS": "3M/10M" });
    assert.deepEqual(out.profileLimits, {});
  });
});
