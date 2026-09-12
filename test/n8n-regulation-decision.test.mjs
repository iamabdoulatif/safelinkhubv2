import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";

// Exécute le nœud Code n8n (docs/n8n/regulation-decision.js) hors n8n en
// simulant $('Boucle routeurs') et $input : un seul test, celui qui casse si
// la décision ou le blocage se dérègle.
const src = readFileSync(new URL("../docs/n8n/regulation-decision.js", import.meta.url), "utf8");
function run(router, read) {
  const fn = new Function("$", "$input", src);
  const $ = () => ({ item: { json: router } });
  return fn($, { first: () => ({ json: read }) })[0].json;
}
const MB = 1024 ** 2, GB = 1024 ** 3;
const policy = { softCapMb: 4.5 * 1024 * 1024, hardCapMb: 5 * 1024 * 1024, safety: 0.95, dayCriticalRatio: 1.1, blockLimit: "64k/64k", abuseThresholdMb: 1024, abuseBlockMinutes: 180, abuseMaxOffenses: 3 };
const base = { routerId: "r1", name: "R1", billingCycleDay: 1, policy, state: null, watch: {} };

describe("nœud n8n Décision", () => {
  it("premier passage : ok, aucun compteur compté", () => {
    const out = run(base, { at: "2026-09-12T10:00:00Z", counters: 10 * GB, wanInterface: "ether1", active: [] });
    assert.equal(out.apply.state.decision, "ok");
    assert.equal(out.apply.limit, "0/0");
    assert.equal(out.changed, false);
    assert.equal(out.apply.state.monthBytes, 0); // le premier relevé sert de référence
  });

  it("cible dépassée → critical, plafond → block, seuils lus depuis policy", () => {
    const state = { decision: "ok", previous: "ok", limit: "0/0", counters: 0, monthBytes: 4.6 * 1024 * GB, dayBytes: 0, monthKey: "2026-09-01", dayKey: "2026-09-12", changedAt: null };
    const crit = run({ ...base, state }, { at: "2026-09-12T10:00:00Z", counters: 0, active: [] });
    assert.equal(crit.apply.state.decision, "critical");
    assert.equal(crit.changed, true);
    assert.equal(crit.apply.events.at(-1).kind, "decision");
    const blk = run({ ...base, state: { ...state, monthBytes: 5.1 * 1024 * GB } }, { at: "2026-09-12T10:00:00Z", counters: 0, active: [] });
    assert.equal(blk.apply.state.decision, "block");
    assert.equal(blk.apply.limit, "64k/64k");
  });

  it("téléchargeur abusif : bloqué 180 min, définitif à la 3e récidive", () => {
    const u = { mac: "AA:BB", address: "10.0.0.5", user: "1j1", bytesOut: 2 * GB, bytesIn: 0 };
    const watch = { "AA:BB": { bytesOut: 0, blockedUntil: 0, offenseCount: 2, permanent: false } };
    const out = run({ ...base, watch }, { at: "2026-09-12T10:00:00Z", counters: 0, active: [u] });
    assert.equal(out.apply.blocks.length, 1);
    assert.equal(out.apply.blocks[0].minutes, undefined); // 3e → définitif
    assert.equal(out.apply.watch["AA:BB"].permanent, true);
    const first = run(base, { at: "2026-09-12T10:00:00Z", counters: 0, active: [u] });
    assert.equal(first.apply.blocks.length, 0); // premier relevé = référence, pas de delta
    const second = run({ ...base, watch: first.apply.watch }, { at: "2026-09-12T10:15:00Z", counters: 0, active: [{ ...u, bytesOut: 4 * GB }] });
    assert.equal(second.apply.blocks[0].minutes, 180);
    assert.equal(second.apply.watch["AA:BB"].offenseCount, 1);
    assert.equal(2 * GB > policy.abuseThresholdMb * MB, true);
  });
});
