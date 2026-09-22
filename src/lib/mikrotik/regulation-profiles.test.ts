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

/** Routeur simulé avec un hotspot, deux files dynamiques et deux tickets. */
function fakeAbuseRouter(queues: Record<string, string>[] = []) {
  const q = [...queues];
  const users = [{ ".id": "*U1", name: "1j1", disabled: "false" }];
  const actives = [{ ".id": "*A1", user: "1j1" }];
  const calls: string[][] = [];
  const client = {
    talk: async (words: string[]) => {
      calls.push(words);
      const cmd = words[0];
      if (cmd === "/ip/hotspot/print") return [{ interface: "HOTSPOT" }];
      if (cmd === "/queue/simple/print") {
        // Le vrai RouterOS honore « ?name= » : sans ça, la recherche de la file
        // de quota ramènerait la file du hotspot et la ferait supprimer.
        const filtre = words.find((w) => w.startsWith("?name="))?.slice(6);
        return filtre ? q.filter((x) => x.name === filtre) : q;
      }
      if (cmd === "/queue/simple/remove") {
        const id = words[1].slice(9);
        const i = q.findIndex((x) => x[".id"] === id);
        if (i >= 0) q.splice(i, 1);
      }
      if (cmd === "/queue/simple/add") {
        q.push({ ".id": `*Q${q.length}`, name: words[1].slice(6), target: words[2].slice(8), "max-limit": words[3].slice(11) });
      }
      if (cmd === "/ip/hotspot/user/print") return users;
      if (cmd === "/ip/hotspot/active/print") return actives;
      if (cmd === "/ip/hotspot/user/profile/print") return [];
      return [];
    },
    close() {},
  };
  return { q, calls, client: client as never };
}

describe("applyRegulation — cascade anti-téléchargement", () => {
  it("bride le contrevenant DEVANT la file du hotspot, et retire ce qui n'a plus lieu d'être", async () => {
    const r = fakeAbuseRouter([
      { ".id": "*H1", name: "<hotspot-1j1>", target: "10.1.0.5/32" },
      { ".id": "*Z9", name: "slh-abuse-parti", target: "10.1.0.9/32", "max-limit": "256k/256k" },
    ]);
    const out = await applyRegulation(r.client, {
      limit: "0/0",
      blocks: [],
      throttles: [{ address: "10.1.0.5/32", user: "1j1" }],
      throttleLimit: "256k/256k",
    });
    assert.equal(out.throttled, 1);
    const ajout = r.calls.find((c) => c[0] === "/queue/simple/add")!;
    assert.ok(ajout.includes("=name=slh-abuse-1j1"));
    assert.ok(ajout.includes("=max-limit=256k/256k"));
    // DEVANT la file dynamique du hotspot, sinon elle gagnerait.
    assert.ok(ajout.includes("=place-before=*H1"));
    // Le bridage d'un client qui n'est plus surveillé est retiré.
    assert.ok(r.calls.some((c) => c[0] === "/queue/simple/remove" && c[1] === "=numbers=*Z9"));
  });

  it("suspendre un code désactive le ticket ET ferme sa session", async () => {
    const r = fakeAbuseRouter();
    const out = await applyRegulation(r.client, {
      limit: "0/0",
      blocks: [],
      suspensions: [{ user: "1j1", reason: "10e récidive" }],
    });
    assert.equal(out.suspended, 1);
    assert.ok(
      r.calls.some((c) => c[0] === "/ip/hotspot/user/set" && c.includes("=disabled=yes")),
    );
    assert.ok(r.calls.some((c) => c[0] === "/ip/hotspot/active/remove" && c[1] === "=numbers=*A1"));
  });

  it("sans contrevenant, aucune file individuelle ne subsiste", async () => {
    const r = fakeAbuseRouter([{ ".id": "*Z1", name: "slh-abuse-vieux", target: "10.1.0.9/32" }]);
    const out = await applyRegulation(r.client, { limit: "0/0", blocks: [], throttles: [] });
    assert.equal(out.throttled, 0);
    assert.ok(r.calls.some((c) => c[0] === "/queue/simple/remove" && c[1] === "=numbers=*Z1"));
  });
});
