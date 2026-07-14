import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";

const containerSetupSource = () =>
  readFile(new URL("../src/lib/mikrotik/container-setup.ts", import.meta.url), "utf8");
const mikhmonTunnelAccessSource = () =>
  readFile(new URL("../src/lib/mikrotik/mikhmon-tunnel-access.ts", import.meta.url), "utf8");

test("auto-setup targets the audited MikHmon v3 container image", async () => {
  const source = await containerSetupSource();

  assert.match(source, /mikhmonv3-safelinkhub:latest/);
  assert.doesNotMatch(source, /latif225\/mikhmon-sf-v1:latest/);
});

test("MikHmon container commands only use RouterOS 7.23 supported properties and fail fast", async () => {
  const source = await containerSetupSource();

  // RouterOS documents tmpdir on /container/config and root-dir on
  // /container/add. layer-dir is not a supported property on either command.
  assert.doesNotMatch(source, /=layer-dir=/);
  // /container/envs identifies a variable list with `list`, not `name`.
  assert.match(source, /\/container\/envs\/add", `=list=\$\{MIKHMON_ENVLIST\}`/);
  // Never wait three minutes for an image if /container/add was rejected.
  assert.match(source, /if \(!containerAdded\.ok\)/);
  // Do not continue to the pull when the temporary storage cannot exist.
  assert.match(source, /if \(!tmpfsCreated\.ok\)/);
});

test("MikHmon install retries without envlist only on RouterOS envlist incompatibility", async () => {
  const source = await containerSetupSource();

  assert.match(source, /isUnsupportedEnvlistError/);
  assert.match(source, /withoutEnvlist\(containerAddCommand\)/);
  assert.match(source, /withoutEnvlist\(containerSetCommand\)/);
  assert.match(source, /container image install \(without session auto-configuration\)/);
});

test("auto-setup migrates legacy Docker bridge names before assigning the Docker gateway", async () => {
  const source = await containerSetupSource();

  assert.match(source, /LEGACY_DOCKER_BRIDGE_NAMES = \["CONTAINERS", "dockers", "DOCKER-SAFELINKHUB", "DOCKER"\]/);
  assert.match(source, /migrateLegacyDockerBridge/);
  assert.match(source, /removeAddressByAddress\(client, `\$\{VETH_GATEWAY\}\/28`\)/);
});

test("auto-setup repairs MikHmon tunnel access and removes duplicate legacy Docker gateways", async () => {
  const containerSetup = await containerSetupSource();
  const helper = await mikhmonTunnelAccessSource();

  assert.match(containerSetup, /ensureMikhmonTunnelAccess\(client, log\)/);
  assert.match(helper, /getDockerBridgeCleanupCommands/);
  assert.match(helper, /MIKHMON_TUNNEL_INTERFACES/);
});

test("USB container installs use USB root and temporary pull paths", async () => {
  const source = await containerSetupSource();

  assert.match(source, /const usbRootDir = "usb1\/mikhmon-app"/);
  assert.match(source, /=tmpdir=usb1\/pull/);
  assert.doesNotMatch(source, /\/flash\/mikhmon/);
});

test("server-side auto-setup rechecks RouterOS device-mode container flag", async () => {
  const source = await containerSetupSource();

  assert.match(source, /\/system\/device-mode\/print/);
  assert.match(source, /deviceModeContainerEnabled/);
  assert.match(source, /container=no/);
});

test("device-mode unlock instructions request all required flags in one confirmable command", async () => {
  const autoSetup = await readFile(
    new URL("../src/app/admin/settings/router-setup/AutoSetupStep.tsx", import.meta.url),
    "utf8",
  );
  const detectedBadge = await readFile(
    new URL("../src/app/admin/settings/router-setup/DetectedModelBadge.tsx", import.meta.url),
    "utf8",
  );
  const deviceDetect = await readFile(
    new URL("../src/lib/mikrotik/device-detect.ts", import.meta.url),
    "utf8",
  );

  for (const source of [autoSetup, detectedBadge, deviceDetect]) {
    assert.match(source, /mode=advanced/);
    assert.match(source, /container=yes/);
    assert.match(source, /hotspot=yes/);
    assert.match(source, /scheduler=yes/);
    assert.match(source, /fetch=yes/);
    assert.match(source, /activation-timeout=10m/);
  }
});

test("hotspot auto-setup keeps one RouterOS server/profile pair with one address per MAC", async () => {
  const source = await containerSetupSource();

  assert.match(source, /const hotspotProfileName = opts\.hotspotName/);
  assert.match(source, /\/ip\/hotspot\/remove/);
  assert.match(source, /\/ip\/hotspot\/profile\/remove/);
  assert.ok(source.includes('`=numbers=${profile[".id"]}`'));
  assert.match(source, /`=name=\$\{hotspotProfileName\}`/);
  assert.match(source, /"=addresses-per-mac=1"/);
  assert.match(source, /`=profile=\$\{hotspotProfileName\}`/);
  assert.doesNotMatch(source, /`=profile=\$\{opts\.hotspotName\}`/);
});

test("default hotspot users are created/reconciled with an optional distinct password", async () => {
  const source = await containerSetupSource();

  assert.match(source, /\/ip\/hotspot\/user\/add", `=name=\$\{name\}`, `=password=\$\{password\}`/);
  assert.match(source, /\/ip\/hotspot\/user\/set/);
  assert.ok(source.includes('`=numbers=${existingUser[0][".id"]}`'));
  assert.match(source, /`=password=\$\{password\}`/);
  // Chaîne → mot de passe = login ; objet {name,password} → mot de passe
  // distinct si fourni, sinon login (compte admin du portail).
  assert.match(source, /typeof entry === "string" \? name : entry\.password\?\.trim\(\) \|\| name/);
});

test("wizard keeps HOTSPOT as the only RouterOS hotspot bridge and hides system identity", async () => {
  const autoSetup = await readFile(
    new URL("../src/app/admin/settings/router-setup/AutoSetupStep.tsx", import.meta.url),
    "utf8",
  );
  const containerSetup = await containerSetupSource();

  assert.doesNotMatch(autoSetup, /Identité système/);
  assert.doesNotMatch(autoSetup, /setIdentity/);
  assert.doesNotMatch(autoSetup, /identity:/);
  assert.doesNotMatch(autoSetup, /Nom du bridge RouterOS/);
  assert.doesNotMatch(autoSetup, /setBridgeName/);
  assert.doesNotMatch(autoSetup, /bridgeName:/);
  assert.match(containerSetup, /const bridgeName = HOTSPOT_BRIDGE_NAME/);
  assert.doesNotMatch(containerSetup, /const bridgeName = opts\.bridgeName/);
});

test("hotspot server address pool is verified and repaired after RouterOS add/set", async () => {
  const source = await containerSetupSource();

  assert.match(source, /const configuredHotspotServers = await client\.talk\(\["\/ip\/hotspot\/print", `\?name=\$\{serverName\}`\]\)/);
  assert.match(source, /configuredServer\?\.\["address-pool"\] !== HOTSPOT_POOL_NAME/);
  assert.match(source, /\/ip\/hotspot\/set", `=numbers=\$\{configuredServer\["\.id"\]\}`, `=address-pool=\$\{HOTSPOT_POOL_NAME\}`/);
  assert.match(source, /repaired hotspot server address pool/);
});

test("auto-setup re-reads hotspot servers before removing every duplicate", async () => {
  const source = await containerSetupSource();

  assert.match(source, /const finalHotspotServers = await client\.talk\(\["\/ip\/hotspot\/print"\]\)/);
  assert.match(source, /server\["\.id"\] !== configuredServer\?\.\["\.id"\]/);
  assert.match(source, /removed duplicate hotspot server/);
  assert.doesNotMatch(source, /for \(const server of existingHotspotServers\)/);
});

test("auto-setup installs the captive portal assigned to the hotspot bridge before fallback templates", async () => {
  const source = await containerSetupSource();

  assert.match(source, /const \[assignedHotspotBridge\] = await db/);
  assert.match(source, /eq\(bridges\.hotspotEnabled, true\)/);
  assert.match(source, /eq\(captiveTemplates\.id, assignedHotspotBridge\.captiveTemplateId\)/);
  assert.match(source, /eq\(captiveTemplates\.isDefault, true\)/);
  assert.ok(
    source.indexOf("assignedHotspotBridge") < source.indexOf("eq(captiveTemplates.isDefault, true)"),
    "bridge assignment must be checked before default package fallback",
  );
});

test("captive portal upload checks RouterOS fetch status replies, not only final done", async () => {
  const source = await readFile(
    new URL("../src/lib/mikrotik/captive-template-upload.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /const fetchStatus = replies\.findLast\(\(reply\) => reply\.status\)\?\.status/);
  assert.match(source, /fetchStatus && fetchStatus !== "finished"/);
  assert.doesNotMatch(source, /const finalStatus = replies\.at\(-1\)\?\.status/);
});
