"use server";

import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { routers, organizations, captiveTemplates, walletTransactions, packages, bridges } from "@/lib/db/schema";
import { getSession, isSuperAdmin } from "@/lib/auth/session";
import { RouterOSClient } from "./client";
import { decryptSecret } from "./crypto";
import { openRouterTunnelWithRetry } from "./relay";
import { computeSubnetInfo, poolRangeExcludingGateway } from "@/lib/net/subnet";
import { VOUCHER_PROFILES, type VoucherProfile } from "./voucher-profiles";
import {
  REMOTE_ACCESS_PORT,
  DOCKER_WEB_PORT,
  TUNNEL_ACCESS_PORT,
  HOTSPOT_BRIDGE_NAME,
} from "./constants";
import { ROUTER_SETUP_PROFILE } from "./router-setup-profile";
import { uploadCaptiveTemplatePackage } from "./captive-template-upload";
import { loadSafelinkhubDefaultPackage, type PackageFile } from "@/lib/captive-templates/package-files";
import { autoSetupFeeCentsFor } from "@/lib/billing/auto-setup-pricing";
import { getWalletBalanceCents } from "@/lib/wallet/actions";

async function connectClient(router: typeof routers.$inferSelect, timeoutMs = 20000) {
  if (!router.host || !router.username || !router.passwordEncrypted) {
    throw new Error("Router is missing connection details.");
  }
  const password = decryptSecret(router.passwordEncrypted);
  const client = new RouterOSClient();
  if (router.connectionMethod === "vpn" || router.connectionMethod === "openvpn") {
    const tunnel = await openRouterTunnelWithRetry(router.host, router.apiPort ?? 8728, timeoutMs);
    await client.connectViaStream(tunnel.stream, router.username, password, timeoutMs);
  } else {
    await client.connect(router.host, router.apiPort ?? 8728, router.username, password, timeoutMs);
  }
  return client;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type Sentence = Record<string, string>;

/**
 * Fixed identifiers reapplied on every run. The user never types these and
 * they never change between installs, so every router provisioned by
 * SafeLinkHub ends up with the exact same internal topology — only the
 * customer-facing fields (hotspot IP, hotspot name, DNS name, SSID) vary.
 */
const WAN_INTERFACE_NAME = "E1-WAN-FAI";
const DOCKER_BRIDGE_NAME = ROUTER_SETUP_PROFILE.containerBridge.name;
// Bridge name used by earlier SafeLinkHub installs before the audited hAP ax²
// profile was normalized to DOCKERS (matching the operator's own reference
// RouterOS config verbatim).
const LEGACY_HOTSPOT_BRIDGE_NAME = "SAFELINKHUB-BRIDGE";
const LEGACY_DOCKER_BRIDGE_NAMES = ["CONTAINERS", "dockers", "DOCKER-SAFELINKHUB"];
const VETH_NAME = "MIKHMON";
const VETH_ADDRESS = "11.11.11.11/28";
const VETH_GATEWAY = "11.11.11.1";
const DOCKER_NETWORK = "11.11.11.0/28";
const HOTSPOT_POOL_NAME = "POOL-HOTSPOT";
const CONTAINER_NAME = "mikhmonv3-safelinkhub:latest";
const LEGACY_CONTAINER_NAMES = ["mikhmon-sf-v1:latest"];
const REMOTE_IMAGE = "latif225/mikhmonv3-safelinkhub:latest";
const NTP_SERVERS = ["196.200.131.160", "196.10.52.57"]; // Côte d'Ivoire NTP

function rosBoolean(value: string | undefined) {
  return value === "true" || value === "yes";
}

async function removeAddressByAddress(client: RouterOSClient, address: string) {
  const rows = await client.talk(["/ip/address/print", `?address=${address}`]).catch(() => [] as Sentence[]);
  for (const row of rows) {
    if (row[".id"]) {
      await client.talk(["/ip/address/remove", `=numbers=${row[".id"]}`]).catch(() => {});
    }
  }
}

async function migrateLegacyDockerBridge(client: RouterOSClient, log: string[]) {
  const targetRows = await client.talk(["/interface/bridge/print", `?name=${DOCKER_BRIDGE_NAME}`]).catch(() => [] as Sentence[]);
  let targetExists = targetRows.length > 0;

  for (const bridgeName of LEGACY_DOCKER_BRIDGE_NAMES) {
    const rows = await client.talk(["/interface/bridge/print", `?name=${bridgeName}`]).catch(() => [] as Sentence[]);
    for (const row of rows) {
      if (!row[".id"]) continue;
      if (!targetExists) {
        await client
          .talk(["/interface/bridge/set", `=numbers=${row[".id"]}`, `=name=${DOCKER_BRIDGE_NAME}`])
          .catch(() => {});
        targetExists = true;
        log.push(`OK: migrated Docker bridge ${bridgeName} to ${DOCKER_BRIDGE_NAME}`);
      } else {
        await client.talk(["/interface/bridge/remove", `=numbers=${row[".id"]}`]).catch(() => {});
        log.push(`OK: removed legacy Docker bridge ${bridgeName}`);
      }
    }
  }
}

/**
 * /container/add returns immediately while RouterOS pulls the image in the
 * background. Poll /container/print until status leaves "downloading"/
 * "extracting", then start it. Gives up after ~3 minutes (large images on
 * slow WAN links) but start-on-boot=yes still guarantees it comes up on the
 * next reboot even if this attempt times out.
 */
async function waitForImageAndStart(client: RouterOSClient, log: string[]) {
  const maxAttempts = 36; // 36 * 5s = 3 minutes
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await sleep(5000);
    let rows: Sentence[];
    try {
      rows = await client.talk(["/container/print", `?name=${CONTAINER_NAME}`]);
    } catch {
      continue;
    }
    const container = rows.find((r) => r.name === CONTAINER_NAME);
    const status = container?.status ?? "";

    if (status === "stopped") {
      try {
        await client.talk(["/container/start", `=numbers=${CONTAINER_NAME}`]);
        log.push(`OK: started container after image pull (status was "${status}")`);
      } catch (err) {
        log.push(
          `SKIP (start container): ${err instanceof Error ? err.message : "error"}`,
        );
      }
      return;
    }
    if (status === "running") {
      log.push("OK: container already running");
      return;
    }
    // "downloading" / "extracting" / "" (not yet reported) -> keep waiting.
  }
  log.push(
    "SKIP (start container): image still pulling after 3 minutes — it will start automatically on the next reboot (start-on-boot=yes)",
  );
}

type RunFn = (words: string[], label: string, timeoutMs?: number) => Promise<void>;

/**
 * The DOCKERS bridge + MIKHMON veth + container engine + MikHmon
 * container — extracted out of provisionHotspotStack so the Topology
 * Builder page can trigger this exact same sequence on its own (the
 * admin doesn't have to run the whole hotspot/Wi-Fi auto-setup just to
 * get MikHmon up), without duplicating the logic.
 *
 * hotspotAddress is optional: when this runs standalone (no hotspot
 * configured yet), the hotspot-gateway-scoped "Docker NAT" dst-nat rule
 * is skipped — the full auto-setup adds it later once a hotspot address
 * exists. The Docker subnet masquerade, ACCES DISTANT, and tunnel NAT
 * rules don't depend on it and are always added.
 */
async function provisionDockerStack(
  client: RouterOSClient,
  log: string[],
  run: RunFn,
  opts: { supportsContainers: boolean; hasUsbStorage: boolean; hotspotAddress?: string },
) {
  // The UI's own architecture/device-mode check (DetectedModelBadge) is
  // what sets opts.supportsContainers — but that detection runs once on
  // page load and can be stale or wrong (e.g. the admin enabled container
  // mode after detection ran). Re-verify directly against the router
  // right before touching anything container-related, since every
  // /container/* command below fails silently (caught by run()) when
  // device-mode hasn't actually been confirmed — previously this meant
  // the whole MikHmon step could quietly no-op without ever telling the
  // admin why.
  //
  // Only device-mode's own "container" flag is checked — /system/package
  // ?name=container was checked here too, but on ARM64 builds (e.g. hAP
  // ax³, confirmed against a real unit) Container support ships built
  // into the base RouterOS image rather than as a separate installable
  // package, so that query always returned zero rows and blocked this
  // step as "package not present" even with device-mode reporting
  // container=yes and a manual WinBox container install working fine.
  let containerPackageReady = opts.supportsContainers;
  if (containerPackageReady) {
    const [deviceMode] = await client
      .talk(["/system/device-mode/print"])
      .catch(() => [] as Sentence[]);
    const deviceModeContainerEnabled = deviceMode ? rosBoolean(deviceMode.container) : false;
    if (!deviceModeContainerEnabled) {
      containerPackageReady = false;
      log.push(
        'SKIP (MikHmon container): RouterOS device-mode still reports container=no — run "/system/device-mode/update mode=advanced container=yes hotspot=yes scheduler=yes fetch=yes activation-timeout=10m", confirm physically with the reset/mode button or a cold power cycle, then re-run auto-setup.',
      );
    }
  }

  if (containerPackageReady) {
    // DOCKERS bridge + veth pair: gives the MikHmon container its own
    // subnet, isolated from the hotspot LAN, router as gateway.
    await migrateLegacyDockerBridge(client, log);
    const dockerBridgeRows = await client
      .talk(["/interface/bridge/print", `?name=${DOCKER_BRIDGE_NAME}`])
      .catch(() => [] as Sentence[]);
    if (dockerBridgeRows.length === 0) {
      await run(["/interface/bridge/add", `=name=${DOCKER_BRIDGE_NAME}`], `${DOCKER_BRIDGE_NAME} bridge`);
    } else {
      log.push(`OK: ${DOCKER_BRIDGE_NAME} bridge already exists`);
    }

    await client.talk(["/interface/veth/remove", `=numbers=${VETH_NAME}`]).catch(() => {});
    await run(
      [
        "/interface/veth/add",
        `=name=${VETH_NAME}`,
        `=address=${VETH_ADDRESS}`,
        `=gateway=${VETH_GATEWAY}`,
        '=gateway6=',
        "=dhcp=no",
      ],
      "MIKHMON veth interface",
    );
    await run(
      ["/interface/bridge/port/add", `=bridge=${DOCKER_BRIDGE_NAME}`, `=interface=${VETH_NAME}`],
      `attach veth to ${DOCKER_BRIDGE_NAME} bridge`,
    );

    await removeAddressByAddress(client, `${VETH_GATEWAY}/28`);
    await run(
      [
        "/ip/address/add",
        `=address=${VETH_GATEWAY}/28`,
        `=interface=${DOCKER_BRIDGE_NAME}`,
        `=network=${DOCKER_NETWORK.split("/")[0]}`,
      ],
      `${DOCKER_BRIDGE_NAME} bridge gateway address`,
    );

    // Container engine: USB-equipped boards pull/extract on the stick
    // (usb1/pull) to spare onboard flash; ax2 / hAP ax lite have no USB
    // port and use the tmpfs scratch space instead.
    let containerRootDir = "tmp/mikhmon-app";
    let containerLayerDir = "tmp/mikhmon-layers";
    if (opts.hasUsbStorage) {
      // RouterOS exposes a plugged-in USB stick as an unformatted /disk
      // entry (slot usb1) — /container/config's tmpdir=usb1/pull silently
      // fails to pull/extract images until that slot is formatted ext4
      // (this is MikroTik's own documented Container prerequisite, the
      // same "Format Drive" step done by hand in WinBox). Re-running
      // auto-setup on an already-formatted stick must not reformat it —
      // that would wipe whatever's already pulled/cached — so this only
      // formats when the slot isn't already ext4.
      const usbDisks = await client.talk(["/disk/print"]).catch(() => []);
      const usb1Disk = usbDisks.find((d) => d.slot === "usb1");
      if (usb1Disk && usb1Disk["file-system"] !== "ext4") {
        await run(
          ["/disk/format-drive", "=slot=usb1", "=file-system=ext4"],
          "format USB stick (usb1, ext4)",
          60000,
        );
      } else if (!usb1Disk) {
        log.push(
          "SKIP (format USB stick): no disk reported at slot usb1 — plug the USB stick in and re-run auto-setup before MikHmon can use it.",
        );
      }

      const usbRootDir = "usb1/mikhmon-app";
      const usbLayerDir = "usb1/mikhmon-layers";
      containerRootDir = usbRootDir;
      containerLayerDir = usbLayerDir;
      await run(
        ["/container/config/set", "=registry-url=https://registry-1.docker.io", "=tmpdir=usb1/pull", `=layer-dir=${usbLayerDir}`],
        "container engine config (USB storage)",
      );
    } else {
      const existingDisks = await client.talk(["/disk/print"]).catch(() => []);
      if (!existingDisks.some((d) => d.slot === "tmp")) {
        await run(
          ["/disk/add", "=slot=tmp", "=tmpfs-max-size=150000000", "=type=tmpfs"],
          "tmpfs disk slot",
        );
      }
      await run(
        ["/container/config/set", "=registry-url=https://registry-1.docker.io", "=tmpdir=tmp/pull", `=layer-dir=${containerLayerDir}`],
        "container engine config (tmpfs)",
      );
    }

    for (const name of [CONTAINER_NAME, ...LEGACY_CONTAINER_NAMES]) {
      await client.talk(["/container/remove", `=numbers=${name}`]).catch(() => {});
    }
    await run(
      [
        "/container/add",
        `=interface=${VETH_NAME}`,
        `=name=${CONTAINER_NAME}`,
        `=remote-image=${REMOTE_IMAGE}`,
        `=layer-dir=${containerLayerDir}`,
        `=root-dir=${containerRootDir}`,
        "=start-on-boot=yes",
      ],
      "container image install (auto-start on boot enabled)",
    );
    await waitForImageAndStart(client, log);

    // NAT: Docker subnet masquerade, remote-access dst-nat, and a second
    // dst-nat reachable via the hotspot gateway IP itself. Each checked
    // by its (chain, action, comment) signature first — none of these
    // are otherwise unique enough for RouterOS to reject a duplicate
    // /add, so without this they'd pile up on every re-run.
    const existingDockerMasquerade = await client
      .talk(["/ip/firewall/nat/print", "?chain=srcnat", "?action=masquerade", "?comment=Docker NAT", `?src-address=${DOCKER_NETWORK}`])
      .catch(() => []);
    if (existingDockerMasquerade.length === 0) {
      await run(
        [
          "/ip/firewall/nat/add",
          "=chain=srcnat",
          `=src-address=${DOCKER_NETWORK}`,
          "=action=masquerade",
          "=comment=Docker NAT",
        ],
        "Docker subnet masquerade",
      );
    }
    const existingRemoteAccessNat = await client
      .talk(["/ip/firewall/nat/print", "?chain=dstnat", "?action=dst-nat", "?comment=ACCES DISTANT"])
      .catch(() => []);
    if (existingRemoteAccessNat.length === 0) {
      await run(
        [
          "/ip/firewall/nat/add",
          "=chain=dstnat",
          `=dst-port=${REMOTE_ACCESS_PORT}`,
          "=protocol=tcp",
          "=action=dst-nat",
          `=to-addresses=${VETH_ADDRESS.split("/")[0]}`,
          "=to-ports=80",
          "=comment=ACCES DISTANT",
        ],
        "remote-access dst-nat port forward",
      );
    }
    if (opts.hotspotAddress) {
      const existingDockerWebNat = await client
        .talk(["/ip/firewall/nat/print", "?chain=dstnat", "?action=dst-nat", "?comment=Docker NAT", `?dst-port=${DOCKER_WEB_PORT}`])
        .catch(() => []);
      if (existingDockerWebNat.length === 0) {
        await run(
          [
            "/ip/firewall/nat/add",
            "=chain=dstnat",
            `=dst-address=${opts.hotspotAddress}`,
            `=dst-port=${DOCKER_WEB_PORT}`,
            "=protocol=tcp",
            "=action=dst-nat",
            `=to-addresses=${VETH_ADDRESS.split("/")[0]}`,
            "=to-ports=80",
            "=comment=Docker NAT",
          ],
          "Docker web dst-nat port forward",
        );
      }
    } else {
      log.push(
        "SKIP (Docker web dst-nat port forward): no hotspot address configured yet — added automatically once the hotspot auto-setup runs.",
      );
    }

    // Third path to MikHmon, deliberately with no dst-address filter (like
    // ACCES DISTANT) so it answers a packet addressed to *any* IP the
    // router owns — including its WireGuard/OpenVPN tunnel address. That
    // lets SafeLinkHub's relay reach MikHmon over the same tunnel already
    // used for WinBox/WebFig/SSH direct access, which works even when the
    // router's WAN sits behind a carrier CGNAT that makes ACCES DISTANT
    // (port 8088, WAN-only) unreachable from the public internet.
    const existingTunnelNat = await client
      .talk(["/ip/firewall/nat/print", "?chain=dstnat", "?action=dst-nat", "?comment=MikHmon via tunnel"])
      .catch(() => []);
    if (existingTunnelNat.length === 0) {
      await run(
        [
          "/ip/firewall/nat/add",
          "=chain=dstnat",
          `=dst-port=${TUNNEL_ACCESS_PORT}`,
          "=protocol=tcp",
          "=action=dst-nat",
          `=to-addresses=${VETH_ADDRESS.split("/")[0]}`,
          "=to-ports=80",
          "=comment=MikHmon via tunnel",
        ],
        "MikHmon tunnel dst-nat port forward",
      );
    }
  } else if (!opts.supportsContainers) {
    log.push(
      "SKIP (MikHmon container): architecture does not support RouterOS Container — hotspot/WiFi configured, no container step run",
    );
  }
}

export type HotspotStackOptions = {
  hotspotAddress: string; // chosen by the admin, e.g. "10.0.0.1"
  hotspotPrefixBits: number; // chosen by the admin, e.g. 8, 19, 23, 24
  hotspotName: string; // chosen by the admin, e.g. "MIRADOR-WIFI"
  dnsName: string; // chosen by the admin, e.g. "mirador.ci"
  // RouterOS system identity (/system/identity). Optional — when omitted,
  // falls back to "HSPT-<first word of hotspotName>" as before, so existing
  // callers that never set this keep their previous behavior.
  identity?: string;
  hasUsbStorage: boolean; // ax2 / hAP ax lite have none; some boards take a USB stick
  // RouterOS Container only runs on arm/arm64/tile — mipsbe/mmips/smips
  // boards (RB951, hEX, hEX S, plain wAP, ...) skip the DOCKERS/MikHmon
  // step entirely rather than failing partway through.
  supportsContainers: boolean;
  reboot: boolean;
  // Full voucher profile definitions to create on this router — lets each
  // operator sell only the voucher durations they actually use, including
  // custom ones the admin defined themselves (see voucher-profiles.ts'
  // buildVoucherProfile), not just the 6 bundled presets. Omitted/empty
  // means "create the bundled presets" (matches prior behavior for callers
  // that don't pass this field yet).
  voucherProfiles?: VoucherProfile[];
  // WiFi network name broadcast on both radios (2.4GHz + 5GHz). Optional —
  // boards with no WiFi radio at all (CCR routers, plain switches) just
  // skip this step instead of failing.
  ssid?: string;
  // RouterOS won't transmit on a WiFi radio until a regulatory country is
  // set — without it, disabled=no can silently leave the radio inactive.
  wifiCountry?: string; // default "United States" — widest-permissive regulatory domain
  // Captive-portal HTML directory name (RouterOS /hotspot/<dir>/, applied to
  // both html-directory and html-directory-override). Default "hotspot"
  // matches the directory the bundled portal templates already use.
  htmlDirectory?: string;
  // Hotspot user names to create with password equal to username (e.g. ["admin",
  // "president01@"]) — optional and empty by default, since this is a
  // multi-tenant SaaS and hardcoding the same login across every
  // customer's router would be a collision/security smell, not a generic
  // default.
  defaultHotspotUsers?: string[];
  // Whether to push the bundled SafeLinkHub captive-portal package onto
  // the hotspot profile's html-directory as part of this same run.
  // Defaults to true (existing behavior for callers that don't pass this
  // field yet) — the wizard's dedicated step lets the admin opt out and
  // keep RouterOS's bare factory-default login page instead.
  installCaptivePortal?: boolean;
  // Mirrors each custom voucher profile created this run as a sellable
  // "Forfait" on /admin/packages — the admin already typed name/price/
  // duration once on the wizard's voucher-profile step, so they shouldn't
  // have to re-enter the same plan by hand on the Packages page too.
  // Upserted by name per org: re-running with the same name updates price/
  // duration instead of duplicating the row.
  packagesToSync?: {
    name: string;
    priceCents: number;
    durationValue: number;
    durationUnit: string;
  }[];
  // Lets the admin rename the RouterOS bridge/hotspot server instead of
  // always getting HOTSPOT_BRIDGE_NAME ("HOTSPOT") / "hotspot1". Trimmed
  // and falls back to those defaults when blank/omitted. Persisted onto
  // the router row on success so other code paths (connection test,
  // captive-template assignment) can resolve the actual live name instead
  // of assuming the default.
  bridgeName?: string;
  serverName?: string;
  // Which of the org's "package" captive-template rows to install when
  // installCaptivePortal isn't explicitly false — lets the admin pick
  // between several bundled/custom portals (e.g. SafeLinkHub vs. Yahya
  // WiFi) on the wizard's "Portail captif" step instead of this always
  // grabbing whichever package template happens to be found first.
  // Falls back to that "first found, else create the bundled default"
  // behavior when omitted, for callers that never offered a choice.
  captiveTemplateId?: string;
};

/**
 * Lets the wizard show pricing/wallet status *before* the admin clicks
 * "Lancer l'auto-setup complet" — same eligibility rule provisionHotspotStack
 * itself enforces, just read-only, so the UI can render a paywall instead of
 * letting the admin click through into an error.
 */
export async function getAutoSetupBillingStatus(routerId: string, supportsContainers: boolean) {
  const session = await getSession();
  if (!session) return { error: "Not authenticated." };

  const db = getDb();
  const [router] = await db
    .select()
    .from(routers)
    .where(eq(routers.id, routerId))
    .limit(1);
  if (!router || router.orgId !== session.orgId) {
    return { error: "Router not found." };
  }

  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, router.orgId))
    .limit(1);
  if (!org) return { error: "Organization not found." };

  // Superadmins (SafeLinkHub staff accounts) never pay, no matter how
  // many routers their org already has — unlimited by role, not by
  // org-level trial state, so this short-circuits before any of the
  // normal free-trial/wallet checks below.
  if (isSuperAdmin(session.role)) {
    return {
      success: true,
      isFree: true,
      alreadyBilled: false,
      feeCents: 0,
      walletBalanceCents: 0,
      sufficientBalance: true,
      unlimited: true as const,
    };
  }

  if (router.autoSetupBilled) {
    return { success: true, isFree: true, alreadyBilled: true, feeCents: 0, walletBalanceCents: 0, sufficientBalance: true };
  }

  // One-off, time-boxed exception for this specific org (e.g. a second
  // free router for a year) — date-bound, so deleting and re-adding a
  // router within the window stays free, unlike the one-time
  // freeRouterSetupUsed flag below.
  if (org.bonusFreeRouterUntil && org.bonusFreeRouterUntil.getTime() > Date.now()) {
    return { success: true, isFree: true, alreadyBilled: false, feeCents: 0, walletBalanceCents: 0, sufficientBalance: true };
  }

  if (!org.freeRouterSetupUsed) {
    return { success: true, isFree: true, alreadyBilled: false, feeCents: 0, walletBalanceCents: 0, sufficientBalance: true };
  }

  const feeCents = autoSetupFeeCentsFor(supportsContainers);
  const walletBalanceCents = await getWalletBalanceCents(org.id);
  return {
    success: true,
    isFree: false,
    alreadyBilled: false,
    feeCents,
    walletBalanceCents,
    sufficientBalance: walletBalanceCents >= feeCents,
  };
}

/**
 * Provisions a full SafeLinkHub hotspot router end to end, mirroring a
 * working device export (RouterOS 7.23, container-capable hAP/CCR boards):
 * renames the WAN port, builds the HOTSPOT bridge across every remaining
 * ethernet port, sets up the hotspot pool/DHCP/profile/DNS name, opens the
 * required NAT rules, then provisions the DOCKER-SAFELINKHUB bridge + veth + container
 * (MikHmon) the same way every time, and finally locks down services,
 * timezone, identity and NTP before rebooting.
 */
export async function provisionHotspotStack(
  routerId: string,
  opts: HotspotStackOptions,
) {
  const session = await getSession();
  if (!session) return { error: "Not authenticated." };

  if (!opts.hotspotAddress.trim()) return { error: "L'adresse du hotspot est requise." };
  if (!opts.hotspotName.trim()) return { error: "Le nom du hotspot est requis." };

  const subnet = computeSubnetInfo(opts.hotspotAddress.trim(), opts.hotspotPrefixBits);
  if (!subnet) {
    return { error: "Adresse IP ou préfixe (/bits) invalide." };
  }

  const db = getDb();
  const [router] = await db
    .select()
    .from(routers)
    .where(eq(routers.id, routerId))
    .limit(1);
  if (!router || router.orgId !== session.orgId) {
    return { error: "Router not found." };
  }

  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, router.orgId))
    .limit(1);
  if (!org) {
    return { error: "Organization not found." };
  }

  const bridgeName = opts.bridgeName?.trim() || HOTSPOT_BRIDGE_NAME;
  const serverName = opts.serverName?.trim() || "hotspot1";
  // Named after the operator's hotspot/brand name (e.g. "SHIAH WIFI"),
  // matching a normal/reference RouterOS hotspot config, not after the
  // technical server name ("hotspot1") — that earlier choice was a
  // workaround for orphaned profiles when the brand name changed between
  // runs, but the server/profile lookup below now matches by which
  // profile the live server actually references (not by name), so
  // renaming this safely updates that same profile in place either way.
  const hotspotProfileName = opts.hotspotName;
  const previousBridgeName = router.hotspotBridgeName?.trim() || HOTSPOT_BRIDGE_NAME;

  // One free auto-setup run per org (tracked on the org, survives the
  // router being deleted and re-added), then a one-time fee per
  // additional router charged to the wallet — see
  // lib/billing/auto-setup-pricing.ts. A router that already consumed
  // either the trial or a paid charge re-runs for free every time after
  // (tweaking config shouldn't cost again). Superadmins are unlimited by
  // role — never billed, regardless of how many routers their org has
  // already configured — matching getAutoSetupBillingStatus above.
  const hasBonusFreeRouter =
    !!org.bonusFreeRouterUntil && org.bonusFreeRouterUntil.getTime() > Date.now();
  const billableCents =
    isSuperAdmin(session.role) || hasBonusFreeRouter
      ? null
      : router.autoSetupBilled
        ? null
        : org.freeRouterSetupUsed
          ? autoSetupFeeCentsFor(opts.supportsContainers)
          : 0;

  if (billableCents !== null && billableCents > 0) {
    const walletBalanceCents = await getWalletBalanceCents(org.id);
    if (walletBalanceCents < billableCents) {
      return {
        error: `Solde du portefeuille insuffisant : il faut ${billableCents.toLocaleString("fr-FR")} FCFA pour configurer ce routeur supplémentaire (solde actuel : ${walletBalanceCents.toLocaleString("fr-FR")} FCFA).`,
        paywall: true as const,
        requiredCents: billableCents,
        walletBalanceCents,
      };
    }
  }

  let client: RouterOSClient;
  try {
    client = await connectClient(router);
  } catch (err) {
    return {
      error:
        err instanceof Error ? `Could not connect: ${err.message}` : "Could not connect.",
    };
  }

  const log: string[] = [];
  const run = async (words: string[], label: string, timeoutMs?: number) => {
    try {
      await client.talk(words, timeoutMs);
      log.push(`OK: ${label}`);
    } catch (err) {
      log.push(`SKIP (${label}): ${err instanceof Error ? err.message : "error"}`);
    }
  };

  // Mandatory firmware update check, run first and over this same API
  // connection (not blind inside the one-shot VPN bootstrap script) so
  // SafeLinkHub can actually see and report what happened. check-for-updates
  // populates installed-version/latest-version; install only fires
  // (downloading the matching version of every currently-installed package
  // — routeros, container, wifi-qcom, zerotier, etc. — and rebooting to
  // apply it) when they differ. The reboot drops this connection, so the
  // rest of provisioning can't continue this run — surfaced as its own
  // result rather than mixed into the step log, so the wizard can tell the
  // admin to simply retry once the router is back online.
  try {
    await client.talk(["/system/package/update/check-for-updates"]).catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 5000));
    const [updateStatus] = await client.talk(["/system/package/update/print"]).catch(() => []);
    const installedVersion = updateStatus?.["installed-version"];
    const latestVersion = updateStatus?.["latest-version"];
    if (installedVersion && latestVersion && installedVersion !== latestVersion) {
      await client.talk(["/system/package/update/install"]).catch(() => {});
      client.close();
      return {
        firmwareUpdating: true as const,
        message: `Mise à jour RouterOS ${installedVersion} → ${latestVersion} en cours — le routeur redémarre. Relancez l'auto-setup une fois qu'il est de nouveau accessible.`,
      };
    }
  } catch {
    // Best-effort: an update-check failure (e.g. no internet on the
    // router's WAN yet) shouldn't block the rest of provisioning.
  }

  try {
    // Permanent WAN port rename, with real visibility in the log instead of
    // a silent fire-and-forget — if neither E1-WAN-FAI nor ether1 exist,
    // every NAT/firewall rule below that targets the WAN interface by name
    // would otherwise silently do nothing and there'd be no clue why.
    const alreadyRenamed = await client
      .talk(["/interface/ethernet/print", `?name=${WAN_INTERFACE_NAME}`])
      .catch(() => []);
    if (alreadyRenamed.length > 0) {
      log.push(`OK: WAN port already named ${WAN_INTERFACE_NAME}`);
    } else {
      const ether1 = await client.talk(["/interface/ethernet/print", "?name=ether1"]).catch(() => []);
      if (ether1.length > 0 && ether1[0][".id"]) {
        // Resolve the real .id instead of passing the name itself as
        // "numbers" — that convenience works for objects this script
        // creates fresh (bridges, veth), but /interface/ethernet/set acts
        // on fixed physical ports, where RouterOS expects the internal id
        // (e.g. "*1"), not the name string. Passing the name there was
        // silently failing on at least one hAP ax³ unit, leaving the WAN
        // port named "ether1" with no error surfaced anywhere.
        await run(
          ["/interface/ethernet/set", `=numbers=${ether1[0][".id"]}`, `=name=${WAN_INTERFACE_NAME}`],
          `rename ether1 to ${WAN_INTERFACE_NAME}`,
        );
      } else {
        log.push(
          `SKIP (WAN port rename): neither ether1 nor ${WAN_INTERFACE_NAME} found on this router — check which port is actually the WAN uplink.`,
        );
      }
    }

    // WiFi SSID on every radio the board actually has (hAP ax² has two —
    // 2.4GHz and 5GHz — single-band boards or CCRs with none just see no
    // matching rows and skip silently). Setting the same SSID twice is a
    // harmless no-op, so this runs unconditionally rather than checking
    // first.
    if (opts.ssid?.trim()) {
      // "United States" is RouterOS's widest-permissive regulatory domain
      // (broadest channel/frequency set), used as the default so the
      // auto-channel selection has the most room to find a valid one —
      // not a claim about the router's actual physical operating country.
      const country = opts.wifiCountry?.trim() || "United States";
      const wifiInterfaces = await client.talk(["/interface/wifi/print"]).catch(() => []);
      for (const wifi of wifiInterfaces) {
        if (!wifi.name) continue;
        // default-name is used to pick the band (5GHz on the first radio,
        // 2.4GHz on the second) the same way the manual export does it —
        // boards with only one radio just get one pass through this loop.
        const isPrimaryRadio = wifi["default-name"] === "wifi1" || wifi.name === "wifi1";
        await run(
          [
            "/interface/wifi/set",
            `=numbers=${wifi.name}`,
            `=channel.band=${isPrimaryRadio ? "5ghz-ax" : "2ghz-ax"}`,
            // No explicit channel.frequency: RouterOS auto-selects a valid
            // channel within whatever band/country is set above. An
            // earlier version hardcoded "2300-75000" here, which isn't a
            // valid frequency range for either band (2.4GHz tops out
            // around 2484 MHz, 5GHz around 5825 MHz) — RouterOS rejected
            // the whole /interface/wifi/set command because of it, so
            // band/width/country/ssid/disabled=no silently never applied
            // either (it's one atomic command), leaving the radio in
            // whatever state it was already in. That's almost certainly
            // why WiFi looked dead even though the script reported success.
            "=channel.skip-dfs-channels=all",
            `=channel.width=${isPrimaryRadio ? "20/40/80mhz" : "20/40mhz"}`,
            `=configuration.country=${country}`,
            "=configuration.mode=ap",
            `=configuration.ssid=${opts.ssid.trim()}`,
            "=disabled=no",
          ],
          `WiFi SSID on ${wifi.name}`,
        );
      }
    }

    // HOTSPOT bridge across every ethernet port that isn't the WAN uplink,
    // plus every WiFi radio (wifi1/wifi2) — without the radios in the
    // bridge, WiFi clients never enter the hotspot's L2 domain at all, so
    // the hotspot service never sees their traffic and the captive portal
    // never shows up. Works the same whether the board has 5 ports (hAP ax
    // lite) or 10+ (ax2) instead of hardcoding a port count.
    // Idempotent on purpose: deleting and recreating this bridge on every
    // run orphans the bridge-port row of any port that was already a
    // member (its master interface vanishes mid-flight) — RouterOS then
    // shows that port's bridge as "unknown" in WinBox, and the move-vs-add
    // logic below couldn't reliably recover it (re-running the wizard a
    // second time left ether2/ether3 stuck on "unknown" while freshly
    // attached ports were fine). Only create it the first time.
    const existingHotspotBridge = await client
      .talk(["/interface/bridge/print", `?name=${bridgeName}`])
      .catch(() => []);
    if (existingHotspotBridge.length > 0) {
      log.push(`OK: ${bridgeName} bridge already exists`);
    } else if (previousBridgeName !== bridgeName) {
      // Admin renamed the bridge from a previous run — rename the live
      // RouterOS object in place (keeps its ports/IP attached) instead of
      // creating a second bridge and orphaning the old one.
      const oldBridge = await client
        .talk(["/interface/bridge/print", `?name=${previousBridgeName}`])
        .catch(() => []);
      if (oldBridge.length > 0 && oldBridge[0][".id"]) {
        await run(
          ["/interface/bridge/set", `=numbers=${oldBridge[0][".id"]}`, `=name=${bridgeName}`],
          `rename ${previousBridgeName} bridge to ${bridgeName}`,
        );
      } else {
        await run(["/interface/bridge/add", `=name=${bridgeName}`], `${bridgeName} bridge`);
      }
    } else {
      await run(["/interface/bridge/add", `=name=${bridgeName}`], `${bridgeName} bridge`);
    }

    const ethernetRows = await client.talk(["/interface/ethernet/print"]).catch(() => []);
    const wifiRows = await client.talk(["/interface/wifi/print"]).catch(() => []);
    const lanPorts = [
      ...ethernetRows.map((r) => r.name),
      ...wifiRows.map((r) => r.name),
    ].filter((name): name is string => Boolean(name) && name !== WAN_INTERFACE_NAME);

    // Routers ship from the factory with ether2..etherN already slaved to a
    // default bridge (commonly "bridge" or "bridge1", with its own DHCP
    // server on 192.168.88.1) — a physical/WiFi interface can only ever be
    // a port of ONE bridge at a time, so blindly /add-ing it to our bridge
    // fails with "already has a master interface" while it's still slaved
    // to that default one. Removes any existing bridge-port row first
    // (whatever bridge it currently points at, including a stale/orphaned
    // one) then adds a fresh one, instead of falling back to add only when
    // no row exists at all.
    for (const port of lanPorts) {
      const existingPort = await client
        .talk(["/interface/bridge/port/print", `?interface=${port}`])
        .catch(() => []);
      if (existingPort.length > 0 && existingPort[0].bridge === bridgeName) {
        continue; // already correctly attached from a previous run
      }
      if (existingPort.length > 0) {
        // Remove the stale row first instead of /set-ing its bridge field
        // in place. Covers both the factory-default case (bridge="bridge")
        // and the orphaned case left by an earlier buggy run that deleted
        // the bridge this row pointed at (bridge comes back empty/unknown)
        // — /set against an orphaned master silently no-ops on at least
        // one RouterOS build, leaving the port shown as "unknown" even
        // though this script reported success. Remove+add is the only
        // path that reliably produces a valid row either way.
        await client
          .talk(["/interface/bridge/port/remove", `=numbers=${existingPort[0][".id"]}`])
          .catch(() => {});
      }
      await run(
        ["/interface/bridge/port/add", `=bridge=${bridgeName}`, `=interface=${port}`],
        existingPort.length > 0
          ? `move ${port} from ${existingPort[0].bridge || "an orphaned bridge reference"} to ${bridgeName} bridge`
          : `attach ${port} to ${bridgeName} bridge`,
      );
    }

    // Every port that was on the legacy bridge name has just been moved
    // off it by the migration loop above — the shell bridge itself is now
    // empty and safe to remove instead of lingering as orphaned clutter.
    await client.talk(["/interface/bridge/remove", `=numbers=${LEGACY_HOTSPOT_BRIDGE_NAME}`]).catch(() => {});

    // Interface lists (WAN / LAN) used for NAT/firewall scoping.
    await run(["/interface/list/add", "=name=WAN"], "WAN interface list");
    await run(["/interface/list/add", "=name=LAN"], "LAN interface list");
    await run(
      ["/interface/list/member/add", `=interface=${WAN_INTERFACE_NAME}`, "=list=WAN"],
      "WAN list member",
    );
    await run(
      ["/interface/list/member/add", `=interface=${bridgeName}`, "=list=LAN"],
      "LAN list member",
    );

    // =numbers= only resolves to a real .id for menus where RouterOS
    // exposes a unique "name"-like property (bridges, schedulers, ...) —
    // /ip/address has no such property, so passing the address string
    // itself here silently matched nothing and this remove was a no-op on
    // every run (caught by .catch and never surfaced). Removes every
    // address currently on the HOTSPOT bridge (not just one matching the
    // exact new value) so changing the hotspot IP between runs actually
    // replaces it instead of leaving the old one assigned alongside the
    // new one — resolving each row's real .id first, same fix pattern as
    // the WAN port rename above.
    const existingHotspotAddresses = await client
      .talk(["/ip/address/print", `?interface=${bridgeName}`])
      .catch(() => []);
    for (const row of existingHotspotAddresses) {
      if (row[".id"]) {
        await client.talk(["/ip/address/remove", `=numbers=${row[".id"]}`]).catch(() => {});
      }
    }
    await run(
      [
        "/ip/address/add",
        `=address=${opts.hotspotAddress}/${opts.hotspotPrefixBits}`,
        `=interface=${bridgeName}`,
        `=network=${subnet.networkAddress}`,
      ],
      "hotspot gateway address",
    );

    await client.talk(["/ip/pool/remove", `=numbers=${HOTSPOT_POOL_NAME}`]).catch(() => {});
    await run(
      [
        "/ip/pool/add",
        `=name=${HOTSPOT_POOL_NAME}`,
        // Pool starts one address after the gateway so the gateway itself
        // never gets handed out to a client.
        `=ranges=${poolRangeExcludingGateway(opts.hotspotAddress, subnet)}`,
      ],
      "hotspot DHCP pool",
    );

    // Cleans up the pool RouterOS's own Hotspot Setup wizard names after
    // the bridge ("<bridge>-pool", e.g. "HOTSPOT-pool") and the one left
    // from the pre-rename "SAFELINKHUB-BRIDGE" topology — neither is
    // HOTSPOT_POOL_NAME, so the unconditional remove above never touched
    // them. Harmless clutter once the hotspot server is repointed at
    // POOL-HOTSPOT (done above this run), but still visible as a
    // confusing leftover ("SAFELINKHUB-BRIDGE-pool") in WinBox until
    // explicitly removed.
    for (const legacyPoolName of [`${LEGACY_HOTSPOT_BRIDGE_NAME}-pool`, `${bridgeName}-pool`]) {
      if (legacyPoolName === HOTSPOT_POOL_NAME) continue;
      await client.talk(["/ip/pool/remove", `=numbers=${legacyPoolName}`]).catch(() => {});
    }

    await client.talk(["/ip/dhcp-server/remove", "=numbers=dhcp1"]).catch(() => {});
    await run(
      [
        "/ip/dhcp-server/add",
        `=address-pool=${HOTSPOT_POOL_NAME}`,
        `=interface=${bridgeName}`,
        "=name=dhcp1",
        "=lease-time=00:30:00",
      ],
      "hotspot DHCP server",
    );
    await run(
      [
        "/ip/dhcp-server/network/add",
        `=address=${subnet.networkAddress}/${opts.hotspotPrefixBits}`,
        `=dns-server=${opts.hotspotAddress},1.1.1.1`,
        `=gateway=${opts.hotspotAddress}`,
        `=netmask=${opts.hotspotPrefixBits}`,
      ],
      "hotspot DHCP network",
    );

    // Edit-in-place instead of remove-then-add for both the profile and
    // the server. Matched by the bridge INTERFACE actually in use, not by
    // the expected name — a server/profile surviving from an older run
    // (different bridge/hotspot name, or RouterOS's own Quick Set
    // defaults) is still the *same logical hotspot service* on this
    // router and must be the one edited, not left alone while a second
    // server+profile pair gets created next to it. Matching by name alone
    // missed that old pair entirely: nothing matched "hotspot1" by name,
    // so a new server/profile got added, the ADD silently failed because
    // RouterOS already had a (disabled, oddly-named) server bound to this
    // same interface, and the cleanup pass below couldn't remove the old
    // profile either since that still-alive old server was still
    // referencing it — net effect, two profiles and a disabled server
    // stuck under its previous name.
    const htmlDirectory = opts.htmlDirectory?.trim() || "hotspot";
    const existingHotspotServers = await client.talk(["/ip/hotspot/print"]).catch(() => []);
    const matchingServer =
      existingHotspotServers.find((s) => s.interface === bridgeName) ?? existingHotspotServers[0];

    const existingProfiles = await client.talk(["/ip/hotspot/profile/print"]).catch(() => []);
    const matchingProfile =
      existingProfiles.find((p) => p.name === matchingServer?.profile) ??
      existingProfiles.find((p) => p.name === hotspotProfileName);

    // If some OTHER profile already has the target name (e.g. an orphan
    // left over from manual WinBox experimentation, unrelated to the
    // live server), remove it first — renaming matchingProfile to that
    // same name via /set below would otherwise collide with it (RouterOS
    // enforces unique profile names) and fail silently.
    const conflictingProfile = existingProfiles.find(
      (p) => p.name === hotspotProfileName && p[".id"] !== matchingProfile?.[".id"],
    );
    if (conflictingProfile?.[".id"]) {
      await client
        .talk(["/ip/hotspot/profile/remove", `=numbers=${conflictingProfile[".id"]}`])
        .catch(() => {});
    }

    const profileFields = [
      `=name=${hotspotProfileName}`,
      `=hotspot-address=${opts.hotspotAddress}`,
      `=dns-name=${opts.dnsName}`,
      `=html-directory=${htmlDirectory}`,
      `=html-directory-override=${htmlDirectory}`,
      "=http-cookie-lifetime=52w1d",
      "=install-hotspot-queue=yes",
      "=login-by=mac,cookie,http-chap,http-pap,mac-cookie",
      "=mac-auth-mode=mac-as-username-and-password",
    ];
    if (matchingProfile?.[".id"]) {
      await run(
        ["/ip/hotspot/profile/set", `=numbers=${matchingProfile[".id"]}`, ...profileFields],
        "hotspot profile",
      );
    } else {
      await run(["/ip/hotspot/profile/add", ...profileFields], "hotspot profile");
    }

    const serverFields = [
      `=address-pool=${HOTSPOT_POOL_NAME}`,
      "=addresses-per-mac=1",
      "=disabled=no",
      `=interface=${bridgeName}`,
      `=name=${serverName}`,
      `=profile=${hotspotProfileName}`,
    ];
    if (matchingServer?.[".id"]) {
      await run(
        ["/ip/hotspot/set", `=numbers=${matchingServer[".id"]}`, ...serverFields],
        "hotspot service",
      );
    } else {
      await run(["/ip/hotspot/add", ...serverFields], "hotspot service");
    }

    // Now safe to clean up any *other* leftover servers/profiles — the
    // one actually in use was just /set above (by .id, not name), so
    // nothing still-referenced gets pulled out from under it.
    for (const server of existingHotspotServers) {
      if (server[".id"] && server[".id"] !== matchingServer?.[".id"]) {
        await client.talk(["/ip/hotspot/remove", `=numbers=${server[".id"]}`]).catch(() => {});
      }
    }
    for (const profile of existingProfiles) {
      if (profile[".id"] && profile.name !== "default" && profile[".id"] !== matchingProfile?.[".id"]) {
        await client
          .talk(["/ip/hotspot/profile/remove", `=numbers=${profile[".id"]}`])
          .catch(() => {});
      }
    }

    // Optional, operator-chosen default hotspot users (e.g. a quick test
    // login) — opt-in per router rather than a fixed multi-tenant default.
    // RouterOS Hotspot login expects a password unless MAC login handles the
    // user; for deterministic client installs, the password is always the
    // same value as the username and existing users are reconciled.
    for (const username of opts.defaultHotspotUsers ?? []) {
      const name = username.trim();
      if (!name) continue;
      const existingUser = await client.talk(["/ip/hotspot/user/print", `?name=${name}`]).catch(() => []);
      if (existingUser.length === 0) {
        await run(["/ip/hotspot/user/add", `=name=${name}`, `=password=${name}`], `hotspot user ${name}`);
      } else if (existingUser[0][".id"]) {
        await run(
          ["/ip/hotspot/user/set", `=numbers=${existingUser[0][".id"]}`, `=password=${name}`],
          `hotspot user ${name} password`,
        );
      }
    }

    // Captive portal: pushes the bundled SafeLinkHub multi-file hotspot
    // portal onto the html-directory the profile above just pointed at, the
    // same way a manual "Importer le portail SafeLinkHub" + "assign to
    // bridge" would (see captive-templates/actions.ts) — except this runs
    // as part of the one-click auto-setup, so RouterOS never falls back to
    // its bare factory-default login page. Reuses the org's existing
    // "package" template if one was already created (so customized support
    // contacts/vendors — see PackageBrandingEditor — survive a re-run);
    // creates the bundled default only if none exists yet.
    if (opts.installCaptivePortal === false) {
      log.push("SKIP (captive portal): désactivé pour cette exécution — page de connexion par défaut RouterOS conservée.");
    } else {
      try {
        let [packageTemplate] = opts.captiveTemplateId
          ? await db
              .select()
              .from(captiveTemplates)
              .where(
                and(
                  eq(captiveTemplates.id, opts.captiveTemplateId),
                  eq(captiveTemplates.orgId, router.orgId),
                  eq(captiveTemplates.templateType, "package"),
                ),
              )
              .limit(1)
          : await db
              .select()
              .from(captiveTemplates)
              .where(and(eq(captiveTemplates.orgId, router.orgId), eq(captiveTemplates.templateType, "package")))
              .limit(1);
        if (!packageTemplate) {
          // Named after the client's own WiFi (SSID) when known, instead
          // of a generic "SafeLinkHub Hotspot" label that's identical
          // across every org and gives the admin no way to tell which
          // portail belongs to which hotspot once they have more than one.
          const templateName = opts.ssid?.trim()
            ? `${opts.ssid.trim()} (portail complet)`
            : "SafeLinkHub Hotspot (portail complet)";
          [packageTemplate] = await db
            .insert(captiveTemplates)
            .values({
              orgId: router.orgId,
              name: templateName,
              isDefault: false,
              templateType: "package",
              packageFiles: loadSafelinkhubDefaultPackage(),
            })
            .returning();
        }

        const files = (packageTemplate.packageFiles as PackageFile[] | null) ?? [];
        const [org] = await db
          .select({ slug: organizations.slug })
          .from(organizations)
          .where(eq(organizations.id, router.orgId))
          .limit(1);

        if (files.length === 0 || !org) {
          log.push("SKIP (captive portal): template ou organisation introuvable.");
        } else {
          const appUrl =
            process.env.NEXT_PUBLIC_APP_URL ??
            (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
          const fileBaseUrl = `${appUrl}/api/router/v1/${org.slug}/captive-template/${packageTemplate.id}`;
          const uploadResult = await uploadCaptiveTemplatePackage(client, {
            files,
            htmlDirectory,
            fileBaseUrl,
            ssid: opts.ssid?.trim() || opts.hotspotName,
          });
          if (uploadResult.failed.length > 0) {
            log.push(
              `SKIP (captive portal): ${uploadResult.failed.length}/${files.length} fichiers n'ont pas pu être envoyés (${uploadResult.failed.map((f) => `${f.path}: ${f.error}`).join("; ")}).`,
            );
          } else {
            log.push(`OK: portail captif SafeLinkHub installé (${uploadResult.uploaded.length} fichiers)`);
          }
        }
      } catch (err) {
        log.push(
          `SKIP (captive portal): ${err instanceof Error ? err.message : "erreur inconnue"}`,
        );
      }
    }

    // ddns-enabled gives the router a reachable hostname even behind CGNAT;
    // dns-name on the hotspot profile is the captive-portal domain.
    await run(["/ip/cloud/set", "=ddns-enabled=yes"], "IP cloud DDNS");
    // Factory-default RouterOS config commonly already runs a DHCP client
    // on the WAN port for plug-and-play internet — RouterOS only allows one
    // per interface, so adding a second one errors. Skip if one's already
    // there (it keeps working fine after the ether1 -> E1-WAN-FAI rename).
    const existingDhcpClient = await client
      .talk(["/ip/dhcp-client/print", `?interface=${WAN_INTERFACE_NAME}`])
      .catch(() => []);
    if (existingDhcpClient.length === 0) {
      await run(
        ["/ip/dhcp-client/add", `=interface=${WAN_INTERFACE_NAME}`, "=name=client1"],
        "WAN DHCP client",
      );
    }
    await run(
      ["/ip/dns/set", "=allow-remote-requests=yes", "=servers=208.67.222.222,8.8.8.8"],
      "DNS resolver",
    );

    // WAN masquerade is needed regardless of container support. RouterOS
    // ships with this exact rule already in place out of the box (out-
    // interface=ether1, no comment) — it auto-follows the WAN rename above,
    // so without this check every re-run added an indistinguishable
    // duplicate on top of it.
    const existingWanMasquerade = await client
      .talk(["/ip/firewall/nat/print", "?chain=srcnat", "?action=masquerade", `?out-interface=${WAN_INTERFACE_NAME}`])
      .catch(() => []);
    if (existingWanMasquerade.length === 0) {
      await run(
        ["/ip/firewall/nat/add", "=chain=srcnat", `=out-interface=${WAN_INTERFACE_NAME}`, "=action=masquerade"],
        "WAN masquerade",
      );
    }

    // Safety net: if the WAN rename above couldn't run (ether1 missing/
    // already something else) but a literal "ether1" interface still
    // exists and actually carries the WAN connection, make sure it's
    // masqueraded too — otherwise a failed rename silently leaves that
    // port with no internet sharing at all.
    const literalEther1 = await client.talk(["/interface/ethernet/print", "?name=ether1"]).catch(() => []);
    if (literalEther1.length > 0) {
      const existingEther1Masquerade = await client
        .talk(["/ip/firewall/nat/print", "?chain=srcnat", "?action=masquerade", "?out-interface=ether1"])
        .catch(() => []);
      if (existingEther1Masquerade.length === 0) {
        await run(
          ["/ip/firewall/nat/add", "=chain=srcnat", "=out-interface=ether1", "=action=masquerade"],
          "WAN masquerade (fallback on ether1, rename did not run)",
        );
      }
    }

    const existingHotspotMasquerade = await client
      .talk(["/ip/firewall/nat/print", "?chain=srcnat", "?action=masquerade", "?comment=masquerade hotspot network"])
      .catch(() => []);
    if (existingHotspotMasquerade.length === 0) {
      await run(
        [
          "/ip/firewall/nat/add",
          "=chain=srcnat",
          "=action=masquerade",
          "=comment=masquerade hotspot network",
          `=src-address=${subnet.networkAddress}/${opts.hotspotPrefixBits}`,
        ],
        "masquerade hotspot network",
      );
    }

    // Placeholder rules reserved for the hotspot service's own auto-managed
    // rules (RouterOS inserts its dynamic hotspot filter/NAT rules right
    // after these passthrough markers) — present in every reference export,
    // disabled by default since they do nothing on their own.
    const placeholderComment = "place hotspot rules here";
    const existingFilterPlaceholder = await client
      .talk(["/ip/firewall/filter/print", `?chain=unused-hs-chain`, `?comment=${placeholderComment}`])
      .catch(() => []);
    if (existingFilterPlaceholder.length === 0) {
      await run(
        [
          "/ip/firewall/filter/add",
          "=chain=unused-hs-chain",
          "=action=passthrough",
          `=comment=${placeholderComment}`,
          "=disabled=yes",
        ],
        "firewall filter placeholder (hotspot rules anchor)",
      );
    }
    const existingNatPlaceholder = await client
      .talk(["/ip/firewall/nat/print", `?chain=unused-hs-chain`, `?comment=${placeholderComment}`])
      .catch(() => []);
    if (existingNatPlaceholder.length === 0) {
      await run(
        [
          "/ip/firewall/nat/add",
          "=chain=unused-hs-chain",
          "=action=passthrough",
          `=comment=${placeholderComment}`,
          "=disabled=yes",
        ],
        "firewall NAT placeholder (hotspot rules anchor)",
      );
    }

    // Security hardening (filter + raw): drop invalid connections, basic
    // DDoS rate-limiting, and WAN DNS blocking — mirrors the reference
    // hardened export, minus the port-scanner-detection and SSH/Telnet
    // brute-force rules that used to live here (see below — both removed
    // for risking self-lockout of legitimate SafeLinkHub/admin traffic).
    // Removed by comment first so reruns don't pile up duplicate rules,
    // and so any router that already has the old rules gets them cleaned
    // up automatically too.
    for (const comment of [
      "Drop Invalid Connections",
      "Drop SSH&TELNET Brute Forcers",
      "BLOCK DNS REQUEST ON WAN INTERFACE",
      "Port scanners to list",
      "SYN/FIN scan",
      "SYN/RST scan",
      "drop port scanners",
    ]) {
      const matches = await client
        .talk(["/ip/firewall/filter/print", `?comment=${comment}`])
        .catch(() => [] as Sentence[]);
      for (const row of matches) {
        if (row[".id"]) {
          await client.talk(["/ip/firewall/filter/remove", `=numbers=${row[".id"]}`]).catch(() => {});
        }
      }
    }
    // One-time cleanup for the rest of the now-removed SSH/Telnet
    // progressive-ban chain (stages 2-5 above never carried a comment,
    // so the by-comment loop just above only ever caught stage 1) —
    // dst-port=22-23 is a signature unique to that removed feature, not
    // used by anything else this script adds.
    const staleBruteForceRules = await client
      .talk(["/ip/firewall/filter/print", "?chain=input", "?dst-port=22-23"])
      .catch(() => [] as Sentence[]);
    for (const row of staleBruteForceRules) {
      if (row[".id"]) {
        await client.talk(["/ip/firewall/filter/remove", `=numbers=${row[".id"]}`]).catch(() => {});
      }
    }
    await run(
      ["/ip/firewall/filter/add", "=chain=input", "=connection-state=invalid", "=action=drop", "=comment=Drop Invalid Connections"],
      "firewall: drop invalid input",
    );
    await run(
      ["/ip/firewall/filter/add", "=chain=forward", "=connection-state=invalid", "=action=drop", "=comment=Drop Invalid Connections"],
      "firewall: drop invalid forward",
    );
    await run(
      ["/ip/firewall/filter/add", "=chain=forward", "=connection-state=new", "=action=jump", "=jump-target=block-ddos"],
      "firewall: jump to DDoS chain",
    );
    await run(
      [
        "/ip/firewall/filter/add",
        "=chain=forward",
        "=connection-state=new",
        "=src-address-list=ddoser",
        "=dst-address-list=ddosed",
        "=action=drop",
      ],
      "firewall: drop known DDoS pairs",
    );
    await run(
      ["/ip/firewall/filter/add", "=chain=block-ddos", "=dst-limit=50,50,src-and-dst-addresses/10s", "=action=return"],
      "firewall: DDoS rate-limit return",
    );
    await run(
      [
        "/ip/firewall/filter/add",
        "=chain=block-ddos",
        "=action=add-dst-to-address-list",
        "=address-list=ddosed",
        "=address-list-timeout=1d",
      ],
      "firewall: mark DDoS dst",
    );
    await run(
      [
        "/ip/firewall/filter/add",
        "=chain=block-ddos",
        "=action=add-src-to-address-list",
        "=address-list=ddoser",
        "=address-list-timeout=1d",
      ],
      "firewall: mark DDoS src",
    );
    await run(
      [
        "/ip/firewall/filter/add",
        "=chain=input",
        `=in-interface=${WAN_INTERFACE_NAME}`,
        "=protocol=tcp",
        "=dst-port=53",
        "=action=drop",
        "=comment=BLOCK DNS REQUEST ON WAN INTERFACE",
      ],
      "firewall: block WAN DNS (tcp)",
    );
    await run(
      [
        "/ip/firewall/filter/add",
        "=chain=input",
        `=in-interface=${WAN_INTERFACE_NAME}`,
        "=protocol=udp",
        "=dst-port=53",
        "=action=drop",
        "=comment=BLOCK DNS REQUEST ON WAN INTERFACE",
      ],
      "firewall: block WAN DNS (udp)",
    );
    // Port-scan-detection filter rules (psd / SYN-FIN / SYN-RST heuristics
    // -> "port scanners" address-list -> drop) used to live here too, same
    // family of bug as the SSH/Telnet ban below: they keyed off generic
    // TCP behavior on the input chain with no source restriction, so they
    // risked catching SafeLinkHub's own relay/tunnel traffic and locking
    // legitimate admin access out, not just real attackers.
    // The SSH/Telnet progressive-ban filter rules that used to live here
    // (SSH_BlackList_1/2/3 -> IP_BlackList, 3 strikes -> 1-day ban) were
    // removed — they keyed off dst-port 22-23 with no source restriction,
    // so legitimate repeated SSH/SFTP connections (FileZilla retries, the
    // admin's own personal VPN access) on port 22 got caught by the exact
    // same escalation meant for brute-forcers, eventually self-banning the
    // admin from their own router for a day. Telnet is disabled outright
    // elsewhere anyway, so there's nothing on port 23 left to brute-force.

    // Raw firewall on the WAN side: only Winbox stays reachable from the
    // internet; every other management/remote-access port is dropped before
    // connection tracking even sees it. The admin still reaches Winbox/API/
    // WebFig from the LAN or VPN — this only restricts the WAN interface.
    await run(
      ["/ip/firewall/raw/add", "=chain=prerouting", "=in-interface-list=WAN", "=protocol=tcp", "=dst-port=8291", "=action=accept"],
      "raw: allow Winbox from WAN",
    );
    const wanBlockedTcpPorts = [8728, 22, 21, 23, 80, 443, 8080, 8729, DOCKER_WEB_PORT, TUNNEL_ACCESS_PORT];
    for (const port of wanBlockedTcpPorts) {
      await run(
        ["/ip/firewall/raw/add", "=chain=prerouting", "=in-interface-list=WAN", "=protocol=tcp", `=dst-port=${port}`, "=action=drop"],
        `raw: drop WAN tcp/${port}`,
      );
    }
    for (const port of [53, 162, 161]) {
      await run(
        ["/ip/firewall/raw/add", "=chain=prerouting", "=in-interface-list=WAN", "=protocol=udp", `=dst-port=${port}`, "=action=drop"],
        `raw: drop WAN udp/${port}`,
      );
    }

    await provisionDockerStack(client, log, run, {
      supportsContainers: opts.supportsContainers,
      hasUsbStorage: opts.hasUsbStorage,
      hotspotAddress: opts.hotspotAddress,
    });


    // Lock down unused management services. Winbox (8291), WebFig (www —
    // moved to :85 below) and the API stay enabled and reachable: the admin
    // added this router through one of those three (Winbox, the API
    // directly, or WebFig) and the auto-setup must not lock that access out.
    await run(["/ip/service/set", "=numbers=telnet", "=disabled=yes"], "disable telnet");
    await run(["/ip/service/set", "=numbers=api-ssl", "=disabled=yes"], "disable api-ssl");
    // The FTP *service* (interactive login) stays off — safelinkhub-group
    // now has the "ftp" *policy* bit (needed for /tool fetch writes, see
    // above), which would otherwise also re-permit logging into this
    // service with that account. /tool fetch doesn't go through this
    // service at all, so disabling it doesn't affect the captive portal.
    await run(["/ip/service/set", "=numbers=ftp", "=disabled=yes"], "disable ftp service (policy bit needed for /tool fetch only)");
    // www (WebFig) moves off :80 — the hotspot needs that port to intercept
    // unauthenticated clients and show the captive portal — but stays
    // enabled at :85 instead of being disabled, so WebFig keeps working.
    await run(["/ip/service/set", "=numbers=www", "=port=85"], "WebFig moved to port 85 (kept enabled)");

    // The plain "api" service (what this very script is running over) is
    // scoped to wherever the admin is actually managing this router from,
    // matching install-vpn/install-openvpn's own restriction — never widen
    // it beyond that plus the Docker subnet, and never disable it, since
    // that would cut off SafeLinkHub itself. The Docker subnet has to stay
    // in this allowlist too: MikHmon (running inside the container at
    // 11.11.11.11) connects to the router's own API at the DOCKER-SAFELINKHUB bridge
    // gateway (11.11.11.1) to manage hotspot users/vouchers — without
    // DOCKER_NETWORK here, that connection gets silently rejected by the
    // api service itself and MikHmon's "Paramètres de session" page shows
    // "MikroTik Not Connected" even with the correct IP/credentials typed in.
    // ssh used to be unconditionally disabled here as a hardening step —
    // but SFTP (what FileZilla and similar tools use) rides on that same
    // ssh service, so disabling it meant FileZilla could never connect
    // even over a working personal VPN, regardless of the separate
    // "Activer l'accès direct SSH" relay forward (port-forward.ts's
    // setSshServiceEnabled only flips this same flag on toggle — most
    // admins reasonably expect VPN access alone to be enough). Scoped to
    // the tunnel subnet instead, the same way the api service already is
    // below: reachable over the private VPN, never from the public WAN.
    if (router.connectionMethod === "vpn") {
      await run(
        ["/ip/service/set", "=numbers=api", `=address=10.66.0.0/24,${DOCKER_NETWORK}`],
        "scope API to WireGuard tunnel subnet + Docker (MikHmon)",
      );
      await run(
        ["/ip/service/set", "=numbers=ssh", "=disabled=no", "=address=10.66.0.0/24"],
        "scope SSH/SFTP (FileZilla) to WireGuard tunnel subnet",
      );
    } else if (router.connectionMethod === "openvpn") {
      await run(
        ["/ip/service/set", "=numbers=api", `=address=10.67.0.0/24,${DOCKER_NETWORK}`],
        "scope API to OpenVPN tunnel subnet + Docker (MikHmon)",
      );
      await run(
        ["/ip/service/set", "=numbers=ssh", "=disabled=no", "=address=10.67.0.0/24"],
        "scope SSH/SFTP (FileZilla) to OpenVPN tunnel subnet",
      );
    } else {
      log.push("OK: API service left open on its current address (direct LAN connection) — Winbox/WebFig/API all unaffected");
      await run(["/ip/service/set", "=numbers=ssh", "=disabled=yes"], "disable ssh (direct LAN connection, no VPN tunnel to scope it to)");
    }

    await run(["/system/clock/set", "=time-zone-name=Africa/Abidjan"], "timezone Africa/Abidjan");
    await run(["/ip/cloud/set", "=ddns-enabled=yes", "=update-time=yes"], "MikroTik Cloud DDNS/time enabled");

    const identityName =
      opts.identity?.trim() || `HSPT-${opts.hotspotName.split(/[\s-]/)[0].toUpperCase()}`;
    await run(["/system/identity/set", `=name=${identityName}`], "system identity");

    await run(["/system/ntp/client/set", "=enabled=yes"], "NTP client enabled");
    for (const server of NTP_SERVERS) {
      const existingServers = await client
        .talk(["/system/ntp/client/servers/print", `?address=${server}`])
        .catch(() => [] as Sentence[]);
      for (const row of existingServers) {
        if (row[".id"]) {
          await client.talk(["/system/ntp/client/servers/remove", `=numbers=${row[".id"]}`]).catch(() => {});
        }
      }
      await run(["/system/ntp/client/servers/add", `=address=${server}`], `NTP server ${server}`);
    }

    // MikHmon voucher profiles: each profile's on-login script schedules its
    // own one-shot expiry job per user, and a matching always-on scheduler
    // job sweeps anyone whose voucher already expired (covers the case
    // where the router rebooted and lost the one-shot scheduler entries).
    // Removed by name first so reruns replace rather than duplicate. The
    // admin picks which durations to offer — including custom ones they
    // defined themselves. Distinguishes "field omitted" (older callers
    // that never offered a choice — fall back to the 6 bundled presets)
    // from "explicitly an empty list" (the wizard's voucher step, where an
    // admin who created zero custom profiles really does mean zero, not
    // "give me the presets I just removed from the UI").
    const wantedProfiles =
      opts.voucherProfiles !== undefined ? opts.voucherProfiles : VOUCHER_PROFILES;
    for (const profile of wantedProfiles) {
      await client
        .talk(["/ip/hotspot/user/profile/remove", `=numbers=${profile.name}`])
        .catch(() => {});
      await run(
        [
          "/ip/hotspot/user/profile/add",
          `=name=${profile.name}`,
          `=address-pool=${HOTSPOT_POOL_NAME}`,
          `=on-login=${profile.onLogin}`,
          "=parent-queue=none",
        ],
        `voucher profile ${profile.name}`,
      );

      await client
        .talk(["/system/scheduler/remove", `=numbers=${profile.name}`])
        .catch(() => {});
      await run(
        [
          "/system/scheduler/add",
          `=name=${profile.name}`,
          `=interval=${profile.monitorInterval}`,
          `=on-event=${profile.monitorOnEvent}`,
          "=policy=ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon",
          "=start-date=jan/01/2024",
          "=start-time=00:00:00",
          `=comment=Monitor Profile ${profile.name}`,
        ],
        `expiry sweep scheduler ${profile.name}`,
      );
    }

    // Mirror each custom voucher profile as a sellable "Forfait" on
    // /admin/packages — upserted by (orgId, name) so re-running with the
    // same profile name updates price/duration instead of duplicating the
    // row, and an admin-edited price on the Packages page isn't silently
    // clobbered unless they actually change the wizard's value too.
    for (const pkg of opts.packagesToSync ?? []) {
      const [existingPackage] = await db
        .select({ id: packages.id })
        .from(packages)
        .where(and(eq(packages.orgId, org.id), eq(packages.name, pkg.name)))
        .limit(1);
      if (existingPackage) {
        await db
          .update(packages)
          .set({
            priceCents: pkg.priceCents,
            durationValue: pkg.durationValue,
            durationUnit: pkg.durationUnit,
          })
          .where(eq(packages.id, existingPackage.id));
        log.push(`OK: forfait "${pkg.name}" mis à jour sur la page Forfaits.`);
      } else {
        await db.insert(packages).values({
          orgId: org.id,
          name: pkg.name,
          priceCents: pkg.priceCents,
          durationValue: pkg.durationValue,
          durationUnit: pkg.durationUnit,
        });
        log.push(`OK: forfait "${pkg.name}" créé sur la page Forfaits.`);
      }
    }

    // Daily cleanup: drop any leftover one-shot expiry schedulers/scripts
    // whose user has already been removed (e.g. by the sweep above), so the
    // scheduler and script lists don't grow unbounded over time.
    await client.talk(["/system/scheduler/remove", "=numbers=CLEAN_JOB"]).catch(() => {});
    await run(
      [
        "/system/scheduler/add",
        "=name=CLEAN_JOB",
        "=interval=1d",
        '=on-event=/sys sch rem [find where on-event=""];/sys scr job rem [find where owner~"sys"]',
        "=policy=ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon",
        "=start-date=jan/01/2024",
        "=start-time=00:00:05",
      ],
      "daily cleanup job (CLEAN_JOB)",
    );

    // Anti connection-sharing TTL rewrite on the hotspot bridge — rewrites
    // every forwarded packet's TTL to 1 past this router, so a client
    // device can't transparently re-share the hotspot connection over its
    // own hotspot/tethering (the chained router would see TTL=0 and the
    // packet would just die instead of reaching the internet).
    const existingMangle = await client
      .talk(["/ip/firewall/mangle/print", `?out-interface=${bridgeName}`, "?action=change-ttl"])
      .catch(() => []);
    if (existingMangle.length === 0) {
      await run(
        [
          "/ip/firewall/mangle/add",
          "=chain=postrouting",
          `=out-interface=${bridgeName}`,
          "=action=change-ttl",
          "=new-ttl=set:1",
          "=passthrough=no",
        ],
        "mangle: anti connection-sharing TTL rewrite",
      );
    }

    // Restricted API user group: scopes whatever account SafeLinkHub
    // connects with to just what the app needs (read/write/test/sensitive/
    // api), explicitly denying every interactive-access policy (winbox,
    // ssh, telnet, web, local, reboot, password, sniff, romon, rest-api)
    // so a leaked API credential can't be used to log into the router
    // directly through any of those surfaces.
    //
    // "ftp" is granted, not denied — RouterOS overloads that single policy
    // bit for two unrelated things: (1) logging into the FTP *server*
    // protocol, and (2) writing a file to disk via /tool fetch's dst-path,
    // which the captive-portal install entirely depends on. Denying it
    // here was blocking every single /tool fetch write with "permission
    // denied" (confirmed against a real router — every login.html/css/js/
    // image upload failed silently this way, regardless of the URL or
    // RouterOS firmware version), so the captive portal's html-directory
    // never actually received any files. The FTP *server* is disabled
    // outright below instead, closing the door this was originally meant
    // to close without breaking /tool fetch.
    await client.talk(["/user/group/remove", "=numbers=safelinkhub-group"]).catch(() => {});
    await run(
      [
        "/user/group/add",
        "=name=safelinkhub-group",
        "=policy=read,write,test,sensitive,api,ftp,!local,!telnet,!ssh,!reboot,!policy,!winbox,!password,!web,!sniff,!romon,!rest-api",
      ],
      "SafeLinkHub API user group",
    );

    // Manual backup helper: exports the full config plus hotspot/NAT/filter
    // sections separately, timestamped, for whenever an admin wants a
    // one-off snapshot straight from the router's own terminal/scheduler.
    await client.talk(["/system/script/remove", "=numbers=export-all"]).catch(() => {});
    await run(
      [
        "/system/script/add",
        "=name=export-all",
        "=dont-require-permissions=no",
        `=owner=${router.username}`,
        "=policy=ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon",
        '=source=:local date [/system clock get date];:local time [/system clock get time];:local filename ("backup-" . [:pick $date 7 11] . "-" . [:pick $date 0 3] . [:pick $date 4 6]);/export compact file=$filename;/ip hotspot export file=("hotspot-" . $filename);/ip firewall nat export file=("nat-" . $filename);/ip firewall filter export file=("filter-" . $filename);:log info ("Export termine : " . $filename)',
      ],
      "export-all backup script",
    );

    if (opts.reboot) {
      log.push("Rebooting router to finalize setup...");
      // RouterOS drops the API connection on reboot before it can reply, so
      // we fire the command and don't wait for a response.
      client.talk(["/system/reboot"]).catch(() => {});
    }

    // Persisted on every successful run (not just billed ones) so other
    // code paths that look up this router's live hotspot config (the
    // connection test, captive-template assignment) resolve the name the
    // admin actually chose instead of assuming the HOTSPOT/hotspot1
    // defaults.
    await db
      .update(routers)
      .set({
        hotspotBridgeName: bridgeName,
        hotspotServerName: serverName,
        // Snapshot of this run's options (minus reboot, re-decided fresh
        // each time) — see lastAutoSetupConfig's schema comment. Lets a
        // later "Continuer l'auto-setup" repair replay this exact
        // configuration against whatever the audit found missing,
        // without the admin re-entering every wizard field.
        lastAutoSetupConfig: { ...opts, reboot: undefined },
      })
      .where(eq(routers.id, routerId));

    // Keep the draft `bridges` row (named e.g. "SAFELINKHUB-BRIDGE" from
    // when it was first sketched in the topology builder, before this
    // router was ever provisioned) in sync with whatever the live
    // RouterOS bridge is actually named now — otherwise every other
    // screen reading bridges.name (captive-template assignment, the
    // recap step) keeps showing the stale draft name forever, alongside
    // "HOTSPOT" being the real interface name on the router itself.
    await db
      .update(bridges)
      .set({ name: bridgeName })
      .where(and(eq(bridges.routerId, routerId), eq(bridges.hotspotEnabled, true)));

    if (billableCents !== null) {
      await db.update(routers).set({ autoSetupBilled: true }).where(eq(routers.id, routerId));
      if (billableCents === 0) {
        await db
          .update(organizations)
          .set({ freeRouterSetupUsed: true })
          .where(eq(organizations.id, org.id));
        log.push("OK: essai gratuit de configuration automatique utilisé pour ce routeur.");
      } else {
        await db.insert(walletTransactions).values({
          orgId: org.id,
          type: "charge",
          amountCents: billableCents,
          note: `Configuration automatique — ${router.name} (${opts.supportsContainers ? "Hotspot + MikHmon" : "Hotspot"})`,
          createdBy: session.userId,
        });
        log.push(
          `OK: ${billableCents.toLocaleString("fr-FR")} FCFA débités du portefeuille pour cette configuration.`,
        );
      }
    }

    return { success: true, log };
  } finally {
    client.close();
  }
}

/**
 * Re-runs provisionHotspotStack against whatever HotspotStackOptions it
 * was last called with for this router (lastAutoSetupConfig) — every
 * step inside is already idempotent (checks live router state before
 * acting), so this only actually changes what auditRouterConfig found
 * missing/incomplete; steps that are already correct are left alone.
 * Lets the admin "continue" a partially-completed auto-setup from the
 * config-audit banner instead of re-typing every wizard field from
 * scratch. reboot is forced off — a quick repair shouldn't bounce the
 * router unless the admin explicitly re-runs the full wizard.
 */
export async function repairRouterConfig(routerId: string) {
  const session = await getSession();
  if (!session) return { error: "Not authenticated." };

  const db = getDb();
  const [router] = await db
    .select()
    .from(routers)
    .where(eq(routers.id, routerId))
    .limit(1);
  if (!router || router.orgId !== session.orgId) {
    return { error: "Router not found." };
  }
  if (!router.lastAutoSetupConfig) {
    return {
      error:
        "Aucune configuration d'auto-setup enregistrée pour ce routeur — lancez d'abord l'assistant complet (Configuration routeur) une fois avant de pouvoir réparer une étape manquante.",
    };
  }

  return provisionHotspotStack(routerId, {
    ...(router.lastAutoSetupConfig as HotspotStackOptions),
    reboot: false,
  });
}

/**
 * Creates the DOCKERS bridge + MIKHMON veth + container engine + MikHmon
 * container on its own, from the Topology Builder page — without running
 * the rest of the hotspot/Wi-Fi auto-setup first. Useful when the admin
 * wants MikHmon up before (or instead of) configuring the hotspot, or
 * just confirmed the device-mode container unlock and wants to create it
 * immediately rather than re-running the whole wizard.
 *
 * If a hotspot bridge already exists for this router (saved from the
 * topology builder itself), its gateway IP is passed through so the
 * hotspot-scoped "Docker NAT" port forward gets created in this same run
 * too — otherwise that one rule is just added later by the full
 * auto-setup once a hotspot address exists.
 */
export async function createDockerContainer(routerId: string, opts: { hasUsbStorage: boolean }) {
  const session = await getSession();
  if (!session) return { error: "Not authenticated." };

  const db = getDb();
  const [router] = await db
    .select()
    .from(routers)
    .where(eq(routers.id, routerId))
    .limit(1);
  if (!router || router.orgId !== session.orgId) {
    return { error: "Router not found." };
  }

  const [existingBridge] = await db
    .select({ gatewayIp: bridges.gatewayIp })
    .from(bridges)
    .where(and(eq(bridges.routerId, routerId), eq(bridges.hotspotEnabled, true)))
    .limit(1);

  let client: RouterOSClient;
  try {
    client = await connectClient(router);
  } catch (err) {
    return {
      error: err instanceof Error ? `Could not connect: ${err.message}` : "Could not connect.",
    };
  }

  const log: string[] = [];
  const run: RunFn = async (words, label, timeoutMs) => {
    try {
      await client.talk(words, timeoutMs);
      log.push(`OK: ${label}`);
    } catch (err) {
      log.push(`SKIP (${label}): ${err instanceof Error ? err.message : "error"}`);
    }
  };

  try {
    await provisionDockerStack(client, log, run, {
      supportsContainers: true,
      hasUsbStorage: opts.hasUsbStorage,
      hotspotAddress: existingBridge?.gatewayIp?.split("/")[0],
    });
    return { success: true, log };
  } catch (err) {
    return {
      error: err instanceof Error ? `Échec : ${err.message}` : "Échec de la création du conteneur.",
      log,
    };
  } finally {
    client.close();
  }
}
