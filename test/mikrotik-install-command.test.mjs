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

  assert.doesNotMatch(source, /eq\(routers\.status, "installing"\)/);
  assert.match(source, /const nowOnline = result\.success \|\| router\.status === "online"/);
  assert.match(source, /status: nowOnline \? "online" : "installing"/);
  assert.match(source, /markOfflineOnFailure: false/);
  assert.match(source, /installTokenHash: null/);
  assert.match(source, /syncRouterStats\(router\.id/);
});

test("install completion does not auto-open public remote access ports", async () => {
  const wireguard = await readFile(
    new URL("../src/app/api/router/v1/[slug]/scripts/install-vpn/installed/route.ts", import.meta.url),
    "utf8",
  );
  const openvpn = await readFile(
    new URL("../src/app/api/router/v1/[slug]/scripts/install-openvpn/installed/route.ts", import.meta.url),
    "utf8",
  );

  for (const source of [wireguard, openvpn]) {
    assert.doesNotMatch(source, /autoEnablePostInstallAccess/);
    assert.doesNotMatch(source, /AUTO_ENABLED_SERVICES_AFTER_INSTALL/);
  }
});

test("install completion endpoint matches by install token alone, not also live status", async () => {
  const source = await readFile(
    new URL("../src/app/api/router/v1/[slug]/scripts/install-vpn/installed/route.ts", import.meta.url),
    "utf8",
  );

  // Polling (checkRouterConnection) can flip status to "online" before
  // this callback fires — requiring status="installing" here made that
  // race the common case, returning 403 and leaving installTokenHash set
  // forever instead of being cleared.
  assert.match(source, /and\(eq\(routers\.orgId, org\.id\), eq\(routers\.installTokenHash, hashToken\(token\)\)\)/);
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

test("RouterOS install scripts create the API group with every policy the audit requires", async () => {
  // La DÉTECTION (audit) et la CRÉATION (scripts d'install) doivent partager la
  // même liste, sinon l'un des deux ment : soit l'audit signale « groupe API
  // incomplet » sur des routeurs fraîchement provisionnés, soit un routeur naît
  // sans une permission dont MikHmon a besoin. REQUIRED_API_GROUP_POLICIES est
  // la source de vérité — ce test lit la constante au lieu de figer la chaîne,
  // pour qu'ajouter une policy à l'audit sans l'ajouter ici casse le test.
  const fixes = await readFile(
    new URL("../src/lib/mikrotik/router-audit-fixes.ts", import.meta.url),
    "utf8",
  );
  const listMatch = fixes.match(/REQUIRED_API_GROUP_POLICIES = \[([\s\S]*?)\] as const/);
  assert.ok(listMatch, "router-audit-fixes.ts should export REQUIRED_API_GROUP_POLICIES");
  const required = [...listMatch[1].matchAll(/"([a-z!]+)"/g)].map((m) => m[1]);
  // `policy` = permission historiquement manquante (schedulers d'expiration des
  // tickets + journal de revenu MikHmon) ; `ftp` = upload du portail captif ;
  // `ssh` = accès FileZilla/SFTP.
  assert.ok(required.length >= 8, "expected the full least-privilege policy set");
  for (const policy of ["policy", "ftp", "ssh"]) {
    assert.ok(required.includes(policy), `${policy} should be a required API group policy`);
  }

  const wireguard = await readFile(
    new URL("../src/app/api/router/v1/[slug]/scripts/install-vpn/route.ts", import.meta.url),
    "utf8",
  );
  // Le script OpenVPN a quitté le fichier de route pour un module à part, afin
  // que sa compatibilité RouterOS 6 puisse être testée en l'appelant vraiment
  // (openvpn-install-script.test.ts). Le garde-fou sur les policies suit le
  // code plutôt que de rester à surveiller un fichier qui ne les porte plus.
  const openvpn = await readFile(
    new URL("../src/lib/mikrotik/openvpn-install-script.ts", import.meta.url),
    "utf8",
  );

  for (const source of [wireguard, openvpn]) {
    const groupAdd = source
      .split("\n")
      .find((line) => line.startsWith("/user group add name=safelinkhub-group policy="));
    assert.ok(groupAdd, "install script should create safelinkhub-group");
    const granted = groupAdd.slice(groupAdd.indexOf("policy=") + 7).split(",");
    for (const policy of required) {
      assert.ok(granted.includes(policy), `install script should grant ${policy}`);
    }
  }
});

test("VPN script fetch is single-use while the callback token remains valid", async () => {
  const wireguard = await readFile(
    new URL("../src/app/api/router/v1/[slug]/scripts/install-vpn/route.ts", import.meta.url),
    "utf8",
  );
  // Ici on surveille le fichier de ROUTE : l'usage unique du jeton est une
  // affaire de requête, elle n'a pas suivi le script dans son module.
  const openvpn = await readFile(
    new URL("../src/app/api/router/v1/[slug]/scripts/install-openvpn/route.ts", import.meta.url),
    "utf8",
  );

  for (const source of [wireguard, openvpn]) {
    assert.match(source, /eq\(routers\.status, "pending"\)/);
    assert.doesNotMatch(source, /inArray\(routers\.status, \["pending", "installing"\]\)/);
    assert.doesNotMatch(source, /installTokenHash: null,\n\s+installTokenExpiresAt: null,/);
  }
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

test("RouterOS WireGuard install script removes duplicate legacy DOCKER gateway before using DOCKERS", async () => {
  const source = await readFile(
    new URL("../src/app/api/router/v1/[slug]/scripts/install-vpn/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /"DOCKER"/);
  assert.match(source, /\/ip address remove \[find interface=\$oldBridge address=11\.11\.11\.1\/28\]/);
  assert.match(source, /\/interface bridge remove \[find name=\$oldBridge\]/);
});

test("relay peer allocation uses live WireGuard allowed IPs to pick the next tunnel address", async () => {
  const source = await readFile(new URL("../src/lib/mikrotik/relay.ts", import.meta.url), "utf8");

  assert.match(source, /wg show wg0 allowed-ips/);
  assert.match(source, /used\[\$octet\]=1/);
  assert.doesNotMatch(source, /safelinkhub-add-peer\.sh/);
});
