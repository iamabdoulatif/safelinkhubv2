import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";

test("generated RouterOS install command reapplies the SafeLinkHub VPN route after import", async () => {
  const source = await readFile(new URL("../src/lib/mikrotik/actions.ts", import.meta.url), "utf8");
  const commandLine = source
    .split("\n")
    .find((line) => line.includes("const command ="));

  assert.ok(commandLine, "generateInstallScript should build a RouterOS command");
  assert.match(
    commandLine,
    /\/import file-name="vpn\.rsc"; :delay 1s; \/ip route remove \[find dst-address=10\.66\.0\.0\/24 gateway=safelinkhub-wg0\]; \/ip route add dst-address=10\.66\.0\.0\/24 gateway=safelinkhub-wg0; :delay 1s; \/file remove "vpn\.rsc"/,
  );
});

test("RouterOS VPN script notifies SafeLinkHub after local installation completes", async () => {
  const source = await readFile(
    new URL("../src/app/api/router/v1/[slug]/scripts/install-vpn/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /callbackUrl: string/);
  assert.match(source, /\/tool fetch url="\$\{opts\.callbackUrl\}"/);
  assert.match(source, /http-header-field="Authorization: Bearer \$\{opts\.installToken\}"/);
  assert.match(source, /SafeLinkHub server notified that VPN tunnel installation completed/);
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
  assert.match(source, /status: result\.success \? "online" : "installing"/);
  assert.match(source, /markOfflineOnFailure: false/);
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

  const removeUserIndex = source.indexOf("/user remove [find name=safelinkhub-api]");
  const removeGroupIndex = source.indexOf("/user group remove [find name=safelinkhub-group]");

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

test("RouterOS WireGuard install script prepares DOCKERS bridge and MIKHMON veth gateway", async () => {
  const source = await readFile(
    new URL("../src/app/api/router/v1/[slug]/scripts/install-vpn/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /\/interface bridge add name=DOCKERS/);
  assert.match(source, /\/interface veth add name=MIKHMON address=11\.11\.11\.11\/28 gateway=11\.11\.11\.1/);
  assert.match(source, /\/interface bridge port add bridge=DOCKERS interface=MIKHMON/);
  assert.match(source, /\/ip address add address=11\.11\.11\.1\/28 interface=DOCKERS network=11\.11\.11\.0/);
});

test("relay peer allocation uses live WireGuard allowed IPs to pick the next tunnel address", async () => {
  const source = await readFile(new URL("../src/lib/mikrotik/relay.ts", import.meta.url), "utf8");

  assert.match(source, /wg show wg0 allowed-ips/);
  assert.match(source, /used\[\$octet\]=1/);
  assert.doesNotMatch(source, /safelinkhub-add-peer\.sh/);
});
