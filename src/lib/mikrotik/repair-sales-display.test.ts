import assert from "node:assert/strict";
import { test } from "node:test";
import type { RouterOSClient } from "./client";
import { repairSalesDisplay } from "./router-audit-fixes";
import { OWNER_SWEEP_NAME } from "./mikhmon-sales";

/** Client factice : route par le premier mot, enregistre tout ce qui est écrit. */
function stubClient(version: string) {
  const calls: string[][] = [];
  const isoSale = {
    ".id": "*1",
    name: "2026-10-13-|-08:15:02-|-ab12-|-500-|-10.5.50.9-|-AA:BB-|-1d-|-JOUR-|-vc-x",
    owner: "202-13",
    source: "2026-10-13",
  };
  const client = {
    async talk(words: string[]) {
      calls.push(words);
      const cmd = words[0];
      if (cmd === "/system/resource/print") {
        if (version === "") throw new Error("version illisible");
        return [{ version }];
      }
      if (cmd === "/system/scheduler/print") return []; // owner-sweep absent
      if (cmd === "/system/script/print") return [{ ...isoSale }]; // une vente ISO
      return []; // add / set
    },
    close() {},
  };
  return { client: client as unknown as RouterOSClient, calls };
}

const addedOwnerSweep = (calls: string[][]) =>
  calls.some((w) => w[0] === "/system/scheduler/add" && w.includes(`=name=${OWNER_SWEEP_NAME}`));

test("7.24+ : planificateur de revenus posé ET vente ISO réécrite", async () => {
  const { client, calls } = stubClient("7.25.1 (stable)");
  const res = await repairSalesDisplay(client);
  assert.equal(res.ownerSweep, "added");
  assert.ok(addedOwnerSweep(calls), "le planificateur owner doit être posé sur 7.24+");
  assert.equal(res.rewritten, 1);
});

test("< 7.24 : pas de planificateur superflu, mais ventes existantes réécrites", async () => {
  const { client, calls } = stubClient("7.10.2 (stable)");
  const res = await repairSalesDisplay(client);
  assert.equal(res.ownerSweep, "skipped");
  assert.ok(!addedOwnerSweep(calls), "aucun planificateur owner sous 7.24");
  assert.equal(res.rewritten, 1);
});

test("version illisible : on s'abstient du planificateur, la réécriture tient", async () => {
  const { client, calls } = stubClient("");
  const res = await repairSalesDisplay(client);
  assert.equal(res.ownerSweep, "skipped");
  assert.ok(!addedOwnerSweep(calls));
  assert.equal(res.rewritten, 1);
});
