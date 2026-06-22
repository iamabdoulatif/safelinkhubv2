import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";

test("generated RouterOS install command reapplies the XenFi VPN route after import", async () => {
  const source = await readFile(new URL("../src/lib/mikrotik/actions.ts", import.meta.url), "utf8");
  const commandLine = source
    .split("\n")
    .find((line) => line.includes("const command ="));

  assert.ok(commandLine, "generateInstallScript should build a RouterOS command");
  assert.match(
    commandLine,
    /\/import file-name="vpn\.rsc"; :delay 1s; \/ip route remove \[find dst-address=10\.66\.0\.0\/24 gateway=xenfi-wg0\]; \/ip route add dst-address=10\.66\.0\.0\/24 gateway=xenfi-wg0; :delay 1s; \/file remove "vpn\.rsc"/,
  );
});

test("RouterOS VPN script notifies XenFi after local installation completes", async () => {
  const source = await readFile(
    new URL("../src/app/api/router/v1/[slug]/scripts/install-vpn/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /callbackUrl: string/);
  assert.match(source, /\/tool fetch url="\$\{opts\.callbackUrl\}"/);
  assert.match(source, /http-header-field="Authorization: Bearer \$\{opts\.installToken\}"/);
  assert.match(source, /XenFi server notified that VPN tunnel installation completed/);
});

test("script fetch moves router into installing state without consuming install token", async () => {
  const source = await readFile(
    new URL("../src/app/api/router/v1/[slug]/scripts/install-vpn/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /status: "installing"/);
  assert.doesNotMatch(source, /installTokenHash: null,\n\s+installTokenExpiresAt: null,/);
});

test("install completion endpoint marks router online and clears install token", async () => {
  const source = await readFile(
    new URL("../src/app/api/router/v1/[slug]/scripts/install-vpn/installed/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /eq\(routers\.status, "installing"\)/);
  assert.match(source, /status: "online"/);
  assert.match(source, /lastSyncAt: new Date\(\)/);
  assert.match(source, /installTokenHash: null/);
  assert.match(source, /syncRouterStats\(router\.id/);
});

test("router setup polling accepts a router already confirmed online by callback", async () => {
  const source = await readFile(new URL("../src/lib/mikrotik/actions.ts", import.meta.url), "utf8");

  assert.match(source, /if \(router\.status === "online"\) \{/);
  assert.match(source, /return \{ connected: true \}/);
});

test("RouterOS VPN script removes API user before its group during reinstall", async () => {
  const source = await readFile(
    new URL("../src/app/api/router/v1/[slug]/scripts/install-vpn/route.ts", import.meta.url),
    "utf8",
  );

  const removeUserIndex = source.indexOf("/user remove [find name=xenfi-api]");
  const removeGroupIndex = source.indexOf("/user group remove [find name=xenfi-group]");

  assert.notEqual(removeUserIndex, -1, "script should remove existing API user");
  assert.notEqual(removeGroupIndex, -1, "script should remove existing API group");
  assert.ok(
    removeUserIndex < removeGroupIndex,
    "existing API user must be removed before its group so RouterOS reinstall does not stop early",
  );
});

test("VPN script can be fetched again while a router is still installing", async () => {
  const source = await readFile(
    new URL("../src/app/api/router/v1/[slug]/scripts/install-vpn/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /inArray\(routers\.status, \["pending", "installing"\]\)/);
});

test("relay peer allocation uses live WireGuard allowed IPs to pick the next tunnel address", async () => {
  const source = await readFile(new URL("../src/lib/mikrotik/relay.ts", import.meta.url), "utf8");

  assert.match(source, /wg show wg0 allowed-ips/);
  assert.match(source, /used\[\$octet\]=1/);
  assert.doesNotMatch(source, /xenfi-add-peer\.sh/);
});
