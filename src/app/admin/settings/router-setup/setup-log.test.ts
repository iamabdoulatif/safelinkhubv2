import test from "node:test";
import assert from "node:assert/strict";
import { formatElapsed, summarizeSetupLog } from "./setup-log";

test("le journal se réduit à ce qui demande une action", () => {
  const s = summarizeSetupLog([
    "OK: hotspot-bridge bridge already exists",
    "FAIL (hotspot server): already have such address",
    "SKIP (captive portal): désactivé pour cette exécution",
    "Rebooting router to finalize setup...",
    "OK: forfait 1 jour",
  ]);
  assert.equal(s.ok, 2);
  assert.deepEqual(s.failures, [{ label: "hotspot server", message: "already have such address" }]);
  assert.deepEqual(s.skipped, [{ label: "captive portal", message: "désactivé pour cette exécution" }]);
});

test("un journal absent ne casse pas l'écran", () => {
  assert.deepEqual(summarizeSetupLog(undefined), { ok: 0, failures: [], skipped: [] });
});

test("la durée écoulée se lit d'un coup d'œil", () => {
  assert.equal(formatElapsed(0), "00:00");
  assert.equal(formatElapsed(102), "01:42");
  assert.equal(formatElapsed(3725), "1:02:05");
  assert.equal(formatElapsed(-4), "00:00");
});
