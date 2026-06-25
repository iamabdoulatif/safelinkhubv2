"use server";

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { routers } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import { RouterOSClient } from "./client";
import { decryptSecret } from "./crypto";
import { openRouterTunnelWithRetry } from "./relay";
import { computeSubnetInfo, poolRangeExcludingGateway } from "@/lib/net/subnet";
import { VOUCHER_PROFILES } from "./voucher-profiles";
import { REMOTE_ACCESS_PORT, DOCKER_WEB_PORT, HOTSPOT_BRIDGE_NAME } from "./constants";
import { ROUTER_SETUP_PROFILE } from "./router-setup-profile";

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
// profile was normalized to DOCKERS.
const LEGACY_HOTSPOT_BRIDGE_NAME = "SAFELINKHUB-BRIDGE";
const LEGACY_DOCKER_BRIDGE_NAME = "CONTAINERS";
const VETH_NAME = "MIKHMON";
const VETH_ADDRESS = "11.11.11.11/28";
const VETH_GATEWAY = "11.11.11.1";
const DOCKER_NETWORK = "11.11.11.0/28";
const HOTSPOT_POOL_NAME = "POOL-HOTSPOT";
const CONTAINER_NAME = "mikhmon-sf-v1:latest";
const REMOTE_IMAGE = "latif225/mikhmon-sf-v1:latest";
const ROOT_DIR = "/mikhmon-app";
const CONTAINER_LAYER_DIR = "/flash/mikhmon-app"; // per-container layer-dir (on /container/add)
const LAYER_DIR = "/flash/mikhmon-layers"; // engine-wide layer-dir (on /container/config/set)
const NTP_SERVERS = ["196.200.131.160", "196.10.52.57"]; // Côte d'Ivoire NTP

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

export type HotspotStackOptions = {
  hotspotAddress: string; // chosen by the admin, e.g. "10.0.0.1"
  hotspotPrefixBits: number; // chosen by the admin, e.g. 8, 19, 23, 24
  hotspotName: string; // chosen by the admin, e.g. "MIRADOR-WIFI"
  dnsName: string; // chosen by the admin, e.g. "mirador.ci"
  hasUsbStorage: boolean; // ax2 / hAP ax lite have none; some boards take a USB stick
  // RouterOS Container only runs on arm/arm64/tile — mipsbe/mmips/smips
  // boards (RB951, hEX, hEX S, plain wAP, ...) skip the DOCKERS/MikHmon
  // step entirely rather than failing partway through.
  supportsContainers: boolean;
  reboot: boolean;
  // Names from VOUCHER_PROFILES the admin wants created on this router (e.g.
  // ["01-JOUR", "01-SEMAINE"]) — lets each operator sell only the voucher
  // durations they actually use. Omitted/empty means "create all of them"
  // (matches prior behavior for callers that don't pass this field yet).
  voucherProfiles?: string[];
  // WiFi network name broadcast on both radios (2.4GHz + 5GHz). Optional —
  // boards with no WiFi radio at all (CCR routers, plain switches) just
  // skip this step instead of failing.
  ssid?: string;
  // RouterOS won't transmit on a WiFi radio until a regulatory country is
  // set — without it, disabled=no can silently leave the radio inactive.
  wifiCountry?: string; // default "United States"
  // Captive-portal HTML directory name (RouterOS /hotspot/<dir>/, applied to
  // both html-directory and html-directory-override). Default "hotspot"
  // matches the directory the bundled portal templates already use.
  htmlDirectory?: string;
  // Hotspot user names to create with no password (e.g. ["admin",
  // "president01@"]) — optional and empty by default, since this is a
  // multi-tenant SaaS and hardcoding the same login across every
  // customer's router would be a collision/security smell, not a generic
  // default.
  defaultHotspotUsers?: string[];
};

/**
 * Provisions a full SafeLinkHub hotspot router end to end, mirroring a
 * working device export (RouterOS 7.23, container-capable hAP/CCR boards):
 * renames the WAN port, builds the HOTSPOT bridge across every remaining
 * ethernet port, sets up the hotspot pool/DHCP/profile/DNS name, opens the
 * required NAT rules, then provisions the DOCKERS bridge + veth + container
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
  const run = async (words: string[], label: string) => {
    try {
      await client.talk(words);
      log.push(`OK: ${label}`);
    } catch (err) {
      log.push(`SKIP (${label}): ${err instanceof Error ? err.message : "error"}`);
    }
  };

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
      if (ether1.length > 0) {
        await run(
          ["/interface/ethernet/set", "=numbers=ether1", `=name=${WAN_INTERFACE_NAME}`],
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
            "=channel.frequency=2300-75000",
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
    await client
      .talk(["/interface/bridge/remove", `=numbers=${HOTSPOT_BRIDGE_NAME}`])
      .catch(() => {});
    await run(["/interface/bridge/add", `=name=${HOTSPOT_BRIDGE_NAME}`], "HOTSPOT bridge");

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
    // to that default one. Move it instead: find its current bridge-port
    // row (if any) and update the bridge field rather than adding a
    // duplicate; only fall back to add when the interface has no row yet.
    for (const port of lanPorts) {
      const existingPort = await client
        .talk(["/interface/bridge/port/print", `?interface=${port}`])
        .catch(() => []);
      if (existingPort.length > 0) {
        if (existingPort[0].bridge === HOTSPOT_BRIDGE_NAME) {
          continue; // already correctly attached from a previous run
        }
        await run(
          ["/interface/bridge/port/set", `=numbers=${existingPort[0][".id"]}`, `=bridge=${HOTSPOT_BRIDGE_NAME}`],
          `move ${port} from ${existingPort[0].bridge || "its previous bridge"} to HOTSPOT bridge`,
        );
      } else {
        await run(
          ["/interface/bridge/port/add", `=bridge=${HOTSPOT_BRIDGE_NAME}`, `=interface=${port}`],
          `attach ${port} to HOTSPOT bridge`,
        );
      }
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
      ["/interface/list/member/add", `=interface=${HOTSPOT_BRIDGE_NAME}`, "=list=LAN"],
      "LAN list member",
    );

    await client
      .talk(["/ip/address/remove", `=numbers=${opts.hotspotAddress}/${opts.hotspotPrefixBits}`])
      .catch(() => {});
    await run(
      [
        "/ip/address/add",
        `=address=${opts.hotspotAddress}/${opts.hotspotPrefixBits}`,
        `=interface=${HOTSPOT_BRIDGE_NAME}`,
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

    await client.talk(["/ip/dhcp-server/remove", "=numbers=dhcp1"]).catch(() => {});
    await run(
      [
        "/ip/dhcp-server/add",
        `=address-pool=${HOTSPOT_POOL_NAME}`,
        `=interface=${HOTSPOT_BRIDGE_NAME}`,
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

    // Remove every non-default profile from previous runs, not just one
    // matching the current name — if the admin re-runs auto-setup with a
    // different hotspot name, the old profile would otherwise be orphaned
    // (still in the list, but unused by any server) instead of replaced.
    const existingProfiles = await client.talk(["/ip/hotspot/profile/print"]).catch(() => []);
    for (const profile of existingProfiles) {
      if (profile.name && profile.name !== "default") {
        await client
          .talk(["/ip/hotspot/profile/remove", `=numbers=${profile.name}`])
          .catch(() => {});
      }
    }
    const htmlDirectory = opts.htmlDirectory?.trim() || "hotspot";
    await run(
      [
        "/ip/hotspot/profile/add",
        `=name=${opts.hotspotName}`,
        `=hotspot-address=${opts.hotspotAddress}`,
        `=dns-name=${opts.dnsName}`,
        `=html-directory=${htmlDirectory}`,
        `=html-directory-override=${htmlDirectory}`,
        "=http-cookie-lifetime=52w1d",
        "=install-hotspot-queue=yes",
        "=login-by=mac,cookie,http-chap,http-pap,mac-cookie",
        "=mac-auth-mode=mac-as-username-and-password",
      ],
      "hotspot profile",
    );

    await client.talk(["/ip/hotspot/remove", "=numbers=hotspot1"]).catch(() => {});
    await run(
      [
        "/ip/hotspot/add",
        `=address-pool=${HOTSPOT_POOL_NAME}`,
        "=addresses-per-mac=1",
        "=disabled=no",
        `=interface=${HOTSPOT_BRIDGE_NAME}`,
        "=name=hotspot1",
        `=profile=${opts.hotspotName}`,
      ],
      "hotspot service",
    );

    // Optional, operator-chosen default hotspot users (e.g. a quick test
    // login) — opt-in per router rather than a fixed multi-tenant default.
    for (const username of opts.defaultHotspotUsers ?? []) {
      const name = username.trim();
      if (!name) continue;
      const existingUser = await client.talk(["/ip/hotspot/user/print", `?name=${name}`]).catch(() => []);
      if (existingUser.length === 0) {
        await run(["/ip/hotspot/user/add", `=name=${name}`], `hotspot user ${name}`);
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
    // DDoS rate-limiting, port-scanner detection, and a progressive
    // SSH/Telnet brute-force blacklist (3 strikes -> 1 day ban) — mirrors
    // the reference hardened export. Removed by comment first so reruns
    // don't pile up duplicate rules.
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
    await run(
      [
        "/ip/firewall/filter/add",
        "=chain=input",
        "=protocol=tcp",
        "=psd=21,3s,3,1",
        "=action=add-src-to-address-list",
        "=address-list=port scanners",
        "=address-list-timeout=2m",
        "=comment=Port scanners to list",
      ],
      "firewall: port-scan detection (psd)",
    );
    await run(
      [
        "/ip/firewall/filter/add",
        "=chain=input",
        "=protocol=tcp",
        "=tcp-flags=fin,syn",
        "=action=add-src-to-address-list",
        "=address-list=port scanners",
        "=address-list-timeout=2m",
        "=comment=SYN/FIN scan",
      ],
      "firewall: port-scan detection (syn/fin)",
    );
    await run(
      [
        "/ip/firewall/filter/add",
        "=chain=input",
        "=protocol=tcp",
        "=tcp-flags=syn,rst",
        "=action=add-src-to-address-list",
        "=address-list=port scanners",
        "=address-list-timeout=2m",
        "=comment=SYN/RST scan",
      ],
      "firewall: port-scan detection (syn/rst)",
    );
    await run(
      [
        "/ip/firewall/filter/add",
        "=chain=input",
        "=src-address-list=port scanners",
        "=action=drop",
        "=comment=drop port scanners",
      ],
      "firewall: drop listed port scanners",
    );
    await run(
      [
        "/ip/firewall/filter/add",
        "=chain=input",
        "=connection-state=new",
        "=protocol=tcp",
        "=dst-port=22-23",
        "=action=add-src-to-address-list",
        "=address-list=SSH_BlackList_1",
        "=address-list-timeout=1m",
        "=comment=Drop SSH&TELNET Brute Forcers",
      ],
      "firewall: SSH/Telnet brute-force stage 1",
    );
    await run(
      [
        "/ip/firewall/filter/add",
        "=chain=input",
        "=connection-state=new",
        "=protocol=tcp",
        "=dst-port=22-23",
        "=src-address-list=SSH_BlackList_1",
        "=action=add-src-to-address-list",
        "=address-list=SSH_BlackList_2",
        "=address-list-timeout=1m",
      ],
      "firewall: SSH/Telnet brute-force stage 2",
    );
    await run(
      [
        "/ip/firewall/filter/add",
        "=chain=input",
        "=connection-state=new",
        "=protocol=tcp",
        "=dst-port=22-23",
        "=src-address-list=SSH_BlackList_2",
        "=action=add-src-to-address-list",
        "=address-list=SSH_BlackList_3",
        "=address-list-timeout=1m",
      ],
      "firewall: SSH/Telnet brute-force stage 3",
    );
    await run(
      [
        "/ip/firewall/filter/add",
        "=chain=input",
        "=connection-state=new",
        "=protocol=tcp",
        "=dst-port=22-23",
        "=src-address-list=SSH_BlackList_3",
        "=action=add-src-to-address-list",
        "=address-list=IP_BlackList",
        "=address-list-timeout=1d",
      ],
      "firewall: SSH/Telnet brute-force escalate to 1-day ban",
    );
    await run(
      [
        "/ip/firewall/filter/add",
        "=chain=input",
        "=protocol=tcp",
        "=dst-port=22-23",
        "=src-address-list=IP_BlackList",
        "=action=drop",
      ],
      "firewall: drop blacklisted SSH/Telnet brute-forcers",
    );

    // Raw firewall on the WAN side: only Winbox stays reachable from the
    // internet; every other management/remote-access port is dropped before
    // connection tracking even sees it. The admin still reaches Winbox/API/
    // WebFig from the LAN or VPN — this only restricts the WAN interface.
    await run(
      ["/ip/firewall/raw/add", "=chain=prerouting", "=in-interface-list=WAN", "=protocol=tcp", "=dst-port=8291", "=action=accept"],
      "raw: allow Winbox from WAN",
    );
    const wanBlockedTcpPorts = [8728, 22, 21, 23, 80, 443, 8080, 8729, DOCKER_WEB_PORT];
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

    // The UI's own architecture/device-mode check (DetectedModelBadge) is
    // what sets opts.supportsContainers — but that detection runs once on
    // page load and can be stale or wrong (e.g. the admin enabled container
    // mode after detection ran). Re-verify directly against the router
    // right before touching anything container-related, since every
    // /container/* command below fails silently (caught by run()) when the
    // package isn't installed or is disabled — previously this meant the
    // whole MikHmon step could quietly no-op without ever telling the admin
    // why.
    let containerPackageReady = opts.supportsContainers;
    if (containerPackageReady) {
      const packages = await client
        .talk(["/system/package/print", "?name=container"])
        .catch(() => []);
      if (packages.length === 0) {
        containerPackageReady = false;
        log.push(
          "SKIP (MikHmon container): the 'container' package is not present on this RouterOS install.",
        );
      } else if (packages[0].disabled === "true") {
        containerPackageReady = false;
        log.push(
          'SKIP (MikHmon container): the \'container\' package is installed but disabled — run "/system device-mode update mode=advanced container=yes", confirm via the reset button, then reboot before re-running auto-setup.',
        );
      }
    }

    if (containerPackageReady) {
      // DOCKERS bridge + veth pair: gives the MikHmon container its own
      // subnet, isolated from the hotspot LAN, router as gateway.
      await client.talk(["/interface/bridge/remove", `=numbers=${DOCKER_BRIDGE_NAME}`]).catch(() => {});
      await run(["/interface/bridge/add", `=name=${DOCKER_BRIDGE_NAME}`], "DOCKERS bridge");
      // Legacy name from before this was aligned to the spec's naming.
      await client.talk(["/interface/bridge/remove", `=numbers=${LEGACY_DOCKER_BRIDGE_NAME}`]).catch(() => {});

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
        "attach veth to DOCKERS bridge",
      );

      await client
        .talk(["/ip/address/remove", `=numbers=${VETH_GATEWAY}/28`])
        .catch(() => {});
      await run(
        [
          "/ip/address/add",
          `=address=${VETH_GATEWAY}/28`,
          `=interface=${DOCKER_BRIDGE_NAME}`,
          `=network=${DOCKER_NETWORK.split("/")[0]}`,
        ],
        "DOCKERS bridge gateway address",
      );

      // Container engine: USB-equipped boards pull/extract on the stick
      // (usb1/pull) to spare onboard flash; ax2 / hAP ax lite have no USB
      // port and use the tmpfs scratch space instead.
      if (opts.hasUsbStorage) {
        await run(
          ["/container/config/set", "=registry-url=https://registry-1.docker.io", "=tmpdir=usb1/pull", `=layer-dir=${LAYER_DIR}`],
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
          ["/container/config/set", "=registry-url=https://registry-1.docker.io", "=tmpdir=/tmp", `=layer-dir=${LAYER_DIR}`],
          "container engine config (tmpfs)",
        );
      }

      await client.talk(["/container/remove", `=numbers=${CONTAINER_NAME}`]).catch(() => {});
      await run(
        [
          "/container/add",
          `=interface=${VETH_NAME}`,
          `=name=${CONTAINER_NAME}`,
          `=remote-image=${REMOTE_IMAGE}`,
          `=layer-dir=${CONTAINER_LAYER_DIR}`,
          `=root-dir=${ROOT_DIR}`,
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
    } else if (!opts.supportsContainers) {
      log.push(
        "SKIP (MikHmon container): architecture does not support RouterOS Container — hotspot/WiFi configured, no container step run",
      );
    }
    // (else: the package-check block above already logged the specific reason)

    // Lock down unused management services. Winbox (8291), WebFig (www —
    // moved to :85 below) and the API stay enabled and reachable: the admin
    // added this router through one of those three (Winbox, the API
    // directly, or WebFig) and the auto-setup must not lock that access out.
    await run(["/ip/service/set", "=numbers=telnet", "=disabled=yes"], "disable telnet");
    await run(["/ip/service/set", "=numbers=ssh", "=disabled=yes"], "disable ssh");
    await run(["/ip/service/set", "=numbers=api-ssl", "=disabled=yes"], "disable api-ssl");
    // www (WebFig) moves off :80 — the hotspot needs that port to intercept
    // unauthenticated clients and show the captive portal — but stays
    // enabled at :85 instead of being disabled, so WebFig keeps working.
    await run(["/ip/service/set", "=numbers=www", "=port=85"], "WebFig moved to port 85 (kept enabled)");

    // The plain "api" service (what this very script is running over) is
    // scoped to wherever the admin is actually managing this router from,
    // matching install-vpn/install-openvpn's own restriction — never widen
    // it, and never disable it, since that would cut off SafeLinkHub itself.
    if (router.connectionMethod === "vpn") {
      await run(["/ip/service/set", "=numbers=api", "=address=10.66.0.0/24"], "scope API to WireGuard tunnel subnet");
    } else if (router.connectionMethod === "openvpn") {
      await run(["/ip/service/set", "=numbers=api", "=address=10.67.0.0/24"], "scope API to OpenVPN tunnel subnet");
    } else {
      log.push("OK: API service left open on its current address (direct LAN connection) — Winbox/WebFig/API all unaffected");
    }

    await run(["/system/clock/set", "=time-zone-name=Africa/Abidjan"], "timezone Africa/Abidjan");

    const identitySlug = opts.hotspotName.split(/[\s-]/)[0].toUpperCase();
    await run(["/system/identity/set", `=name=HSPT-${identitySlug}`], "system identity");

    await run(["/system/ntp/client/set", "=enabled=yes"], "NTP client enabled");
    for (const server of NTP_SERVERS) {
      await run(["/system/ntp/client/servers/add", `=address=${server}`], `NTP server ${server}`);
    }

    // MikHmon voucher profiles (01-JOUR, 05-JOURS, 01-SEMAINE, 02-SEMAINES,
    // 01-MOIS, 05-MINS): each profile's on-login script schedules its own
    // one-shot expiry job per user, and a matching always-on scheduler job
    // sweeps anyone whose voucher already expired (covers the case where the
    // router rebooted and lost the one-shot scheduler entries). Removed by
    // name first so reruns replace rather than duplicate. The admin picks
    // which durations to offer; no selection means "create them all".
    const wantedProfiles =
      opts.voucherProfiles && opts.voucherProfiles.length > 0
        ? VOUCHER_PROFILES.filter((p) => opts.voucherProfiles!.includes(p.name))
        : VOUCHER_PROFILES;
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
      .talk(["/ip/firewall/mangle/print", `?out-interface=${HOTSPOT_BRIDGE_NAME}`, "?action=change-ttl"])
      .catch(() => []);
    if (existingMangle.length === 0) {
      await run(
        [
          "/ip/firewall/mangle/add",
          "=chain=postrouting",
          `=out-interface=${HOTSPOT_BRIDGE_NAME}`,
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
    // ssh, telnet, ftp, web, local, reboot, password, sniff, romon,
    // rest-api) so a leaked API credential can't be used to log into the
    // router directly through any of those surfaces.
    await client.talk(["/user/group/remove", "=numbers=safelinkhub-group"]).catch(() => {});
    await run(
      [
        "/user/group/add",
        "=name=safelinkhub-group",
        "=policy=read,write,test,sensitive,api,!local,!telnet,!ssh,!ftp,!reboot,!policy,!winbox,!password,!web,!sniff,!romon,!rest-api",
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

    return { success: true, log };
  } finally {
    client.close();
  }
}
