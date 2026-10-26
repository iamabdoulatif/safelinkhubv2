import assert from "node:assert/strict";
import { test } from "node:test";
import { openPaymentLane, paymentLaneScriptLines, paymentLaneUser, removePaymentLane } from "./payment-lane";
import type { RouterOSClient } from "./client";

// Faux client : enregistre chaque commande et répond au strict minimum pour que
// openPaymentLane aille jusqu'au login (profil présent, pas de session active,
// user neuf, hôte connu).
function fakeClient(calls: string[][]): RouterOSClient {
  return {
    talk: async (cmd: string[]) => {
      calls.push(cmd);
      const path = cmd[0];
      if (path === "/ip/hotspot/user/profile/print") return [{ ".id": "*1" }];
      if (path === "/ip/hotspot/active/print") return [];
      if (path === "/ip/hotspot/user/print") return [];
      if (path === "/ip/hotspot/host/print") return [{ address: "10.5.5.9" }];
      return [];
    },
  } as unknown as RouterOSClient;
}

test("paymentLaneUser : dérivé du MAC, sans séparateurs", () => {
  assert.equal(paymentLaneUser("5A:AC:A9:24:BF:63"), "pay-5aaca924bf63");
});

test("paymentLaneScriptLines : profil, sondes en FWD, accept avant reject, en tête du forward", () => {
  const lines = paymentLaneScriptLines(["188.114.96.2"], "safelinkhub-walled-garden");
  const script = lines.join("\n");
  assert.match(script, /user profile add name="slh-paiement" address-list="slh-paiement" session-timeout=10m/);
  assert.match(script, /dns static add name="captive\.apple\.com" type=FWD .*address-list="slh-paiement-ok"/);
  assert.match(script, /address-list add list="slh-paiement-ok" address=188\.114\.96\.2/);
  // Ajout inversé : le reject est ajouté AVANT les accept pour finir DERRIÈRE eux.
  const reject = lines.findIndex((l) => l.includes("action=reject"));
  const acceptWg = lines.findIndex((l) => l.includes('dst-address-list="safelinkhub-walled-garden" action=accept'));
  assert.ok(reject >= 0 && acceptWg > reject);
  assert.ok(lines.filter((l) => l.includes("place-before=")).length === 3);
});

test("openPaymentLane : la restriction par client est posée AVANT le login", async () => {
  const calls: string[][] = [];
  const ok = await openPaymentLane(fakeClient(calls), "5A:AC:A9:24:BF:63");
  assert.equal(ok, true);
  const addIdx = calls.findIndex(
    (c) => c[0] === "/ip/firewall/address-list/add" && c.includes("=list=slh-paiement"),
  );
  const loginIdx = calls.findIndex((c) => c[0] === "/ip/hotspot/active/login");
  assert.ok(addIdx >= 0, "l'IP du client doit être ajoutée à slh-paiement");
  assert.ok(loginIdx >= 0 && addIdx < loginIdx, "le rejet doit couvrir le client avant son authentification");
});

test("removePaymentLane : ne retire que les objets SafeLinkHub", async () => {
  const calls: string[][] = [];
  const client = {
    talk: async (cmd: string[]) => {
      calls.push(cmd);
      if (cmd[0] === "/ip/hotspot/user/print") return [{ ".id": "*u1", name: "pay-aabb", comment: "safelinkhub-paiement" }];
      if (cmd[0] === "/ip/hotspot/user/profile/print") return [{ ".id": "*p1", name: "slh-paiement" }];
      if (cmd[0] === "/ip/firewall/address-list/print" && cmd.includes("?list=slh-paiement")) {
        return [{ ".id": "*a1", comment: "safelinkhub-paiement-client" }, { ".id": "*a2", comment: "operator-owned" }];
      }
      return [];
    },
  } as unknown as RouterOSClient;

  await removePaymentLane(client);
  assert.ok(calls.some((c) => c[0] === "/ip/hotspot/user/remove" && c.includes("=numbers=*u1")));
  assert.ok(calls.some((c) => c[0] === "/ip/hotspot/user/profile/remove" && c.includes("=numbers=*p1")));
  assert.ok(calls.some((c) => c[0] === "/ip/firewall/address-list/remove" && c.includes("=numbers=*a1")));
  assert.ok(!calls.some((c) => c.includes("=numbers=*a2")));
});
