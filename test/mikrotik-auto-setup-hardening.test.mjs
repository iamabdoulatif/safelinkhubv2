import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";

const containerSetupSource = () =>
  readFile(new URL("../src/lib/mikrotik/container-setup.ts", import.meta.url), "utf8");
const mikhmonTunnelAccessSource = () =>
  readFile(new URL("../src/lib/mikrotik/mikhmon-tunnel-access.ts", import.meta.url), "utf8");

test("auto-setup installs the mikhmon-sf-v1 image and cleans up the legacy v3 container", async () => {
  const source = await containerSetupSource();

  // Active image (operator's explicit choice): latif225/mikhmon-sf-v1:latest.
  assert.match(source, /REMOTE_IMAGE = "latif225\/mikhmon-sf-v1:latest"/);
  assert.match(source, /CONTAINER_NAME = "mikhmon-sf-v1:latest"/);
  // The previous v3 container must still be referenced so it is removed as a
  // legacy container during provisioning (in-place migration).
  assert.match(source, /LEGACY_CONTAINER_NAMES = \["mikhmonv3-safelinkhub:latest"\]/);
});

test("MikHmon container commands only use RouterOS 7.23 supported properties and fail fast", async () => {
  const source = await containerSetupSource();

  // layer-dir IS a /container/config property, and scenario 2 (hAP ax lite/ax²,
  // no USB and no disk1) deliberately points it at the persistent flash NAND so
  // the pulled image survives a power cut. What RouterOS does NOT accept is
  // layer-dir on /container/add — that command only takes root-dir.
  assert.match(source, /"\/container\/config\/set",[\s\S]{0,200}"=layer-dir=flash\/mikhmon-layers"/);
  assert.doesNotMatch(source, /\/container\/add"[\s\S]{0,400}=layer-dir=/);
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
  assert.match(source, /container image install \(sans envlist\)/);
});

test("auto-setup reconciles existing WAN/LAN interface lists before adding members", async () => {
  const source = await containerSetupSource();
  const interfaceListSection = source.slice(
    source.indexOf("existingInterfaceLists"),
    source.indexOf("// =numbers= only resolves"),
  );

  assert.match(source, /getMissingInterfaceListNames/);
  assert.match(source, /getMissingInterfaceListMembers/);
  assert.match(source, /\/interface\/list\/print/);
  assert.match(source, /\/interface\/list\/member\/print/);
  assert.match(interfaceListSection, /FAIL \(read interface lists\)/);
  assert.match(interfaceListSection, /FAIL \(read interface list members\)/);
  assert.doesNotMatch(interfaceListSection, /\.catch\(\(\) => \[\] as Sentence\[\]\)/);
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

test("USB container installs use the detected USB slot for root and pull paths", async () => {
  const source = await containerSetupSource();

  // Le slot réel rapporté par /disk/print (usb1, usb2, microSD…), jamais "usb1"
  // en dur : une clé branchée sur un autre slot doit rester utilisable.
  assert.match(source, /const usbSlot = usbDisk\?\.slot \?\? "usb1"/);
  assert.match(source, /containerRootDir = `\$\{usbSlot\}\/mikhmon-app`/);
  assert.match(source, /`=tmpdir=\$\{usbSlot\}\/pull`/);
  // Règle d'or du choix de stockage : le root-dir du conteneur n'est JAMAIS sur
  // le tmpfs. Sans clé USB ni slot disk interne, MikHmon vit sur la flash NAND
  // persistante — sinon la session est perdue à chaque coupure de courant.
  assert.match(source, /containerRootDir = "flash\/mikhmon-app"/);
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

test("auto-setup preserves voucher-profile identities used by existing tickets", async () => {
  const source = await containerSetupSource();

  // Supprimer puis recréer un profil lui donne un nouvel ID RouterOS ; les
  // tickets existants gardent l'ancien ID et Winbox les affiche alors
  // "unknown". Un rerun doit donc mettre le profil à jour en place.
  assert.doesNotMatch(source, /\/ip\/hotspot\/user\/profile\/remove/);
  assert.match(source, /\/ip\/hotspot\/user\/profile\/print/);
  assert.match(source, /\/ip\/hotspot\/user\/profile\/set/);
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

test("la veth MIKHMON est corrigée en place, jamais arrachée au conteneur", async () => {
  const source = await containerSetupSource();

  // RÉGRESSION : un remove+add fabriquait un objet veth NEUF sous un conteneur
  // qui restait accroché à l'ancien — « could not acquire interface: no
  // device », Interface « unknown », définitivement. Un simple re-run de
  // l'auto-setup suffisait à casser un MikHmon qui marchait.
  assert.doesNotMatch(source, /"\/interface\/veth\/remove"/);
  assert.match(source, /"\/interface\/veth\/print", `\?name=\$\{VETH_NAME\}`/);
  assert.match(source, /"\/interface\/veth\/set"/);

  // Et le rattachement au pont ne se retente que s'il manque vraiment.
  assert.match(source, /"\/interface\/bridge\/port\/print", `\?interface=\$\{VETH_NAME\}`/);
});

test("le conteneur existant se voit RÉAFFIRMER son interface", async () => {
  const source = await containerSetupSource();
  const setBlock = source.slice(
    source.indexOf("const containerSetCommand = ["),
    source.indexOf("} else {", source.indexOf("const containerSetCommand = [")),
  );

  // C'est ce qui répare un conteneur déjà orphelin : sans =interface=, le `set`
  // ne touchait que start-on-boot et l'orphelin le restait.
  assert.match(setBlock, /"\/container\/set"/);
  assert.match(setBlock, /`=interface=\$\{VETH_NAME\}`/);
  // Repli si le build refuse le paramètre, comme pour envlist.
  assert.match(source, /\/interface\/i\.test\(containerUpdated\.error\)/);
});
