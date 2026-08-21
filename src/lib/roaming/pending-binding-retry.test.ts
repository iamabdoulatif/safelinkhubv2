import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { retryPendingRoamingBindingsForRouter } from "./pending-binding-retry";

const root = new URL("../../..", import.meta.url);

test("reprend les liaisons roaming en attente au retour du routeur", async () => {
  const calls: string[] = [];
  const result = await retryPendingRoamingBindingsForRouter("router-sud", {
    loadPending: async () => [{ id: "binding-latif" }],
    sync: async ({ bindingId, onlyRouterId }) => {
      calls.push(`${bindingId}:${onlyRouterId}`);
      return { ok: true, boundOn: 1 };
    },
  });

  assert.deepEqual(calls, ["binding-latif:router-sud"]);
  assert.deepEqual(result, { attempted: 1, synchronized: 1 });
});

test("continue les reprises même si une liaison isolée échoue", async () => {
  const result = await retryPendingRoamingBindingsForRouter("router-sud", {
    loadPending: async () => [{ id: "binding-erreur" }, { id: "binding-ok" }],
    sync: async ({ bindingId }) =>
      bindingId === "binding-erreur" ? { ok: false, reason: "router-error" } : { ok: true, boundOn: 1 },
  });

  assert.deepEqual(result, { attempted: 2, synchronized: 1 });
});

test("le health-check reprend les liaisons quand un routeur revient en ligne", async () => {
  const source = await readFile(new URL("src/lib/mikrotik/router-sync.ts", root), "utf8");
  assert.match(source, /if \(wasOffline\)[\s\S]*retryPendingRoamingBindingsForRouter/);
});
