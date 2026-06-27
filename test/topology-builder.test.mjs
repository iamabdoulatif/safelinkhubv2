import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";

test("router interface discovery includes RouterOS wifi interfaces", async () => {
  const source = await readFile(new URL("../src/lib/mikrotik/bridges.ts", import.meta.url), "utf8");

  assert.match(source, /r\.type === "wifi"/);
  assert.match(source, /\/interface\/wifi\/print/);
});

test("topology builder renders wifi interfaces and connector lines", async () => {
  const source = await readFile(
    new URL("../src/app/admin/settings/router-setup/TopologyBuilder.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /isWifiInterface/);
  assert.match(source, /Wifi/);
  assert.match(source, /ConnectionLines/);
  assert.match(source, /Lignes de connexion des interfaces/);
  assert.match(source, /strokeDasharray/);
});

test("topology builder uses an original-style canvas layout", async () => {
  const source = await readFile(
    new URL("../src/app/admin/settings/router-setup/TopologyBuilder.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /TopologyCanvas/);
  assert.match(source, /Ajouter un bridge/);
  assert.match(source, /RouterDeviceCard/);
  assert.match(source, /TopologyZoomControls/);
  assert.match(source, /TopologyMiniMap/);
  assert.match(source, /radial-gradient/);
  assert.match(source, /SAFELINKHUB-BRIDGE/);
  assert.match(source, /Pas de PPPoE/);
});
