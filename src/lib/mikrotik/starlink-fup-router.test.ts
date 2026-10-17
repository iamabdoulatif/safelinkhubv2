import assert from "node:assert/strict";
import { test } from "node:test";
import { applyFupToRouter, releaseFupFromRouter, clearFastTrackedConnections } from "./starlink-fup-router";
import { buildFupEnforcement, FUP_QUEUE, FUP_SCRIPT, FUP_BOOT } from "./starlink-fup-enforcement";
import { suggestedStarlinkLinks } from "./starlink-fup-presets";

const at = new Date("2026-10-17T12:00:00Z");
const links = suggestedStarlinkLinks("0c1fea72-50fb-4593-a740-ea2a3fe49c5f");
test("expired FastTrack sessions are harmless; other cleanup errors still fail", async () => {
  const commands: string[][][] = [];
  const client = {
    talk: async () => Array.from({ length: 513 }, (_, i) => ({ ".id": `*${i}`, fasttrack: i === 512 ? "false" : "true" })),
    talkBatch: async (batch: string[][]) => { commands.push(batch); return batch.map(() => ({ status: "rejected", reason: new Error("no such item (4)") })); },
  };
  await clearFastTrackedConnections(client as never);
  assert.equal(commands.length, 2);
  assert.equal(commands.flat().length, 512);
  assert.ok(commands.flat().every(words => words[1].startsWith("=.id=")));
  client.talkBatch = async () => [{ status: "rejected", reason: new Error("not enough permissions") }];
  await assert.rejects(clearFastTrackedConnections(client as never), /not enough permissions/);
});
const plan = buildFupEnforcement(links, Object.fromEntries(links.map(l => [l.id, {
  cycleStart: l.cycleStart, cycleEnd: l.cycleEnd, cycleUsedBytes: 4800e9, rawBytes: 1000,
  uptimeSeconds: 3600, at: at.toISOString(), baselineConfirmed: true,
}])), at);

function fake(failQueue = false, cpu = "20") {
  const calls: string[][] = [];
  const tables: Record<string, Record<string, string>[]> = {
    "/ip/firewall/filter": [{ ".id": "*ft", action: "fasttrack-connection", disabled: "false", comment: "existing fasttrack" }],
  };
  let id = 0;
  const client = { talk: async (words: string[]) => {
    calls.push(words);
    const command = words[0], split = command.lastIndexOf("/"), path = command.slice(0, split), action = command.slice(split + 1);
    if (path === "/queue/type" && words.some(w => w.startsWith("=comment="))) throw new Error("unknown parameter comment");
    if (path.endsWith("/firewall/filter") && action === "move" && words.includes("=destination=0")) throw new Error("cannot move builtin");
    const now = new Date().toISOString();
    if (command === "/system/resource/print") return [{ "cpu-load": cpu }];
    if (command === "/system/clock/print") return [{ date: now.slice(0, 10), time: now.slice(11, 19), "gmt-offset": "+00:00" }];
    if (command === "/ip/hotspot/print") return [{ interface: "HOTSPOT1" }, { interface: "HOTSPOT2" }];
    if (command === "/queue/simple/move" && words.includes("=destination=0") && words.includes(`=numbers=${tables["/queue/simple"]?.[0]?.[".id"]}`)) throw new Error("can not move object before itself");
    if (command === "/system/backup/save" || action === "run" || action === "move") return [];
    const rows = tables[path] ?? (tables[path] = []);
    const params = Object.fromEntries(words.slice(1).filter(w => w.startsWith("=")).map(w => { const n = w.indexOf("=", 1); return [w.slice(1, n), w.slice(n + 1)]; }));
    if (action === "print") return rows.filter(r => words.filter(w => w.startsWith("?")).every(w => { const n = w.indexOf("="); return r[w.slice(1, n)] === w.slice(n + 1); })).map(r => ({ ...r }));
    if (failQueue && command === "/queue/simple/add") throw new Error("simulated queue failure");
    if (action === "add") {
      const newId = `*${++id}`;
      rows.push({ ".id": newId, ...params, disabled: params.disabled === "yes" ? "true" : "false" });
      return [{ ret: newId }];
    }
    if (action === "set") { const row = rows.find(r => r[".id"] === params.numbers); if (row) Object.assign(row, params, params.disabled ? { disabled: params.disabled === "yes" ? "true" : "false" } : {}); }
    if (action === "remove") tables[path] = rows.filter(r => r[".id"] !== params.numbers);
    return [];
  } };
  return { client: client as never, calls, tables };
}

test("adapter verifies shared volume cap, covers both IP families and keeps portal chains untouched", async () => {
  const router = fake();
  const result = await applyFupToRouter(router.client, plan, null);
  assert.equal(result.reserve, true);
  assert.deepEqual(result.fastTrackIds, ["*ft"]);
  const q = router.tables["/queue/simple"].find(r => r.name === FUP_QUEUE)!;
  assert.equal(q.target, "HOTSPOT1,HOTSPOT2");
  assert.equal(Number(q["total-max-limit"]), plan.totalBps);
  assert.equal(q["max-limit"], `${plan.uploadBps}/${plan.downloadBps}`);
  for (const family of ["/ip", "/ipv6"]) assert.equal(router.tables[`${family}/firewall/filter`].filter(r => r.action === "drop" && r.chain === "forward").length, 2);
  const boot = router.tables["/system/scheduler"].find(r => r.name === FUP_BOOT)!;
  assert.equal(boot.interval, "0s");
  assert.equal(boot["start-time"], "startup");
  assert.equal(router.tables["/system/scheduler"].find(r => r.name === FUP_SCRIPT)!.interval, "5s");
  await applyFupToRouter(router.client, plan, result);
  router.tables["/ip/firewall/filter"].find(r => r.comment === "slh-fup-stop-in")!.disabled = "false";
  await assert.rejects(applyFupToRouter(router.client, plan, result), /Protection locale déclenchée/);
  assert.ok(!router.calls.some(w => w.includes("=chain=input") || w.includes("=disabled=yes") && w[0] === "/ip/hotspot/user/set"));
  await releaseFupFromRouter(router.client, result);
  assert.equal(router.tables["/ip/firewall/filter"].find(r => r[".id"] === "*ft")!.disabled, "false");
  assert.deepEqual(router.tables["/queue/simple"], []);
  assert.deepEqual(router.tables["/queue/type"], []);
});

test("first installation failure restores FastTrack and removes only FUP resources", async () => {
  const router = fake(true);
  await assert.rejects(applyFupToRouter(router.client, plan, null), /simulated queue failure/);
  assert.equal(router.tables["/ip/firewall/filter"].find(r => r[".id"] === "*ft")!.disabled, "false");
  assert.equal(router.tables["/ip/firewall/filter"].length, 1);
  assert.deepEqual(router.tables["/queue/type"], []);
});

test("high CPU refuses activation before mutating the routeur", async () => {
  const router = fake(false, "90");
  await assert.rejects(applyFupToRouter(router.client, plan, null), /CPU/);
  assert.ok(router.calls.every(w => w[0].endsWith("/print")));
});
