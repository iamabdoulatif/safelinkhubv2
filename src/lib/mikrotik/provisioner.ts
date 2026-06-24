import { RouterOSClient } from "./client";

/**
 * Standalone, idempotent MikroTik provisioner — a class-based equivalent of
 * the manual WinBox procedure (rename WAN, build the HOTSPOT/DOCKERS
 * bridges, wire up DHCP/DNS/NAT, lock down services). Every step checks
 * RouterOS state with `print`/`find` before `add`/`set`, so re-running the
 * whole sequence against an already-configured router is a no-op rather
 * than an error or a duplicate.
 *
 * This class owns only the steps from the original manual playbook. The
 * SafeLinkHub app's own auto-setup (provisionHotspotStack in
 * container-setup.ts) layers extra steps on top — the MikHmon container,
 * voucher profiles, and broader WAN firewall hardening — by injecting an
 * already-connected RouterOSClient via `MikroTikProvisioner.withClient`
 * instead of opening a second connection.
 */

export type ProvisionerConfig = {
  // Connection (ignored when constructed via withClient).
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  connectTimeoutMs?: number;

  // Interfaces.
  wanInterfaceName?: string; // default "E1-WAN-FAI"
  vethName?: string; // default "MKHMON"
  vethAddress?: string; // default "11.11.11.11/28"
  vethGateway?: string; // default "11.11.11.1"

  // Bridges.
  hotspotBridgeName?: string; // default "HOTSPOT"
  dockerBridgeName?: string; // default "DOCKERS"
  hotspotBridgePorts?: string[]; // default ["ether2","ether3","ether4","ether5","wifi1","wifi2"]

  // IP / DHCP / DNS.
  hotspotAddress?: string; // default "10.0.0.1"
  hotspotPrefixBits?: number; // default 16
  dhcpPoolName?: string; // default "pool-hotspot"
  dhcpPoolRanges?: string; // default "10.0.0.2-10.0.255.254"
  dhcpServerName?: string; // default "dhcp-hotspot"
  dnsServers?: string; // default "208.67.222.222,8.8.8.8"

  // System.
  identity?: string; // default "HSPT-WIFIVILLAGE"
  timezone?: string; // default "Africa/Abidjan"
  ntpServers?: string[]; // default ["196.200.131.160", "196.10.52.57"]
  enableCloudDdns?: boolean; // default true
  disableSsh?: boolean; // default true
  disableApiSsl?: boolean; // default true
};

type StepResult = {
  step: string;
  ok: boolean;
  skipped: boolean;
  message: string;
};

const DEFAULTS = {
  wanInterfaceName: "E1-WAN-FAI",
  vethName: "MKHMON",
  vethAddress: "11.11.11.11/28",
  vethGateway: "11.11.11.1",
  hotspotBridgeName: "HOTSPOT",
  dockerBridgeName: "DOCKERS",
  hotspotBridgePorts: ["ether2", "ether3", "ether4", "ether5", "wifi1", "wifi2"],
  hotspotAddress: "10.0.0.1",
  hotspotPrefixBits: 16,
  dhcpPoolName: "pool-hotspot",
  dhcpPoolRanges: "10.0.0.2-10.0.255.254",
  dhcpServerName: "dhcp-hotspot",
  dnsServers: "208.67.222.222,8.8.8.8",
  identity: "HSPT-WIFIVILLAGE",
  timezone: "Africa/Abidjan",
  ntpServers: ["196.200.131.160", "196.10.52.57"],
  enableCloudDdns: true,
  disableSsh: true,
  disableApiSsl: true,
};

export class MikroTikProvisioner {
  private client: RouterOSClient;
  private ownsClient: boolean;
  private config: Required<
    Omit<ProvisionerConfig, "host" | "port" | "username" | "password" | "connectTimeoutMs">
  > &
    Pick<ProvisionerConfig, "host" | "port" | "username" | "password" | "connectTimeoutMs">;
  private results: StepResult[] = [];

  constructor(config: ProvisionerConfig = {}) {
    this.client = new RouterOSClient();
    this.ownsClient = true;
    this.config = { ...DEFAULTS, ...config };
  }

  /**
   * Use an already-connected client (e.g. one opened through the relay's
   * SSH tunnel for VPN-only routers) instead of dialing a new direct
   * connection. connect()/disconnect() become no-ops in this mode — the
   * caller owns the connection's lifecycle.
   */
  static withClient(client: RouterOSClient, config: ProvisionerConfig = {}) {
    const instance = new MikroTikProvisioner(config);
    instance.client = client;
    instance.ownsClient = false;
    return instance;
  }

  private record(step: string, ok: boolean, skipped: boolean, message: string) {
    this.results.push({ step, ok, skipped, message });
    return { ok, skipped, message };
  }

  /** print with a single ?key=value filter, returns matching rows. */
  private async find(path: string, key: string, value: string) {
    return this.client.talk([`${path}/print`, `?${key}=${value}`]).catch(() => []);
  }

  private async existsByName(path: string, name: string) {
    const rows = await this.find(path, "name", name);
    return rows.length > 0;
  }

  async connect() {
    if (!this.ownsClient) return this.record("connect", true, true, "Using injected client");
    const { host, port, username, password, connectTimeoutMs } = this.config;
    if (!host || !username || !password) {
      throw new Error("host, username and password are required to connect()");
    }
    await this.client.connect(host, port ?? 8729, username, password, connectTimeoutMs ?? 8000);
    return this.record("connect", true, false, `Connected to ${host}:${port ?? 8729}`);
  }

  async disconnect() {
    if (this.ownsClient) this.client.close();
    return this.record("disconnect", true, false, "Connection closed");
  }

  /** 1.1 — rename ether1 to the WAN-facing interface name. */
  async renameWAN() {
    const { wanInterfaceName } = this.config;
    try {
      if (await this.existsByName("/interface/ethernet", wanInterfaceName)) {
        return this.record(
          "renameWAN",
          true,
          true,
          `${wanInterfaceName} already exists — skipped`,
        );
      }
      const ether1 = await this.find("/interface/ethernet", "name", "ether1");
      if (ether1.length === 0) {
        return this.record(
          "renameWAN",
          false,
          true,
          "ether1 not found (already renamed in a previous run, or board has no ether1)",
        );
      }
      await this.client.talk([
        "/interface/ethernet/set",
        "=numbers=ether1",
        `=name=${wanInterfaceName}`,
      ]);
      return this.record("renameWAN", true, false, `ether1 renamed to ${wanInterfaceName}`);
    } catch (err) {
      return this.record("renameWAN", false, false, errMsg(err));
    }
  }

  /** 1.2 — veth interface backing the Docker/MikHmon container. */
  async createVETH() {
    const { vethName, vethAddress, vethGateway } = this.config;
    try {
      if (await this.existsByName("/interface/veth", vethName)) {
        return this.record("createVETH", true, true, `${vethName} already exists — skipped`);
      }
      await this.client.talk([
        "/interface/veth/add",
        `=name=${vethName}`,
        `=address=${vethAddress}`,
        `=gateway=${vethGateway}`,
      ]);
      return this.record(
        "createVETH",
        true,
        false,
        `Created veth ${vethName} (${vethAddress}, gateway ${vethGateway})`,
      );
    } catch (err) {
      return this.record("createVETH", false, false, errMsg(err));
    }
  }

  /** 2 — HOTSPOT (LAN/WiFi) and DOCKERS (container) bridges. */
  async createBridges() {
    const { hotspotBridgeName, dockerBridgeName } = this.config;
    const messages: string[] = [];
    let ok = true;
    for (const name of [hotspotBridgeName, dockerBridgeName]) {
      try {
        if (await this.existsByName("/interface/bridge", name)) {
          messages.push(`${name} already exists — skipped`);
          continue;
        }
        await this.client.talk(["/interface/bridge/add", `=name=${name}`]);
        messages.push(`Created bridge ${name}`);
      } catch (err) {
        ok = false;
        messages.push(`${name}: ${errMsg(err)}`);
      }
    }
    return this.record("createBridges", ok, false, messages.join("; "));
  }

  /** 3 — WAN/LAN interface lists and their members. */
  async createInterfaceLists() {
    const { wanInterfaceName, hotspotBridgeName } = this.config;
    const messages: string[] = [];
    let ok = true;
    for (const name of ["WAN", "LAN"]) {
      try {
        if (await this.existsByName("/interface/list", name)) {
          messages.push(`list ${name} already exists — skipped`);
        } else {
          await this.client.talk(["/interface/list/add", `=name=${name}`]);
          messages.push(`Created interface list ${name}`);
        }
      } catch (err) {
        ok = false;
        messages.push(`list ${name}: ${errMsg(err)}`);
      }
    }

    const memberships: Array<[string, string]> = [
      ["WAN", wanInterfaceName],
      ["LAN", hotspotBridgeName],
    ];
    for (const [list, iface] of memberships) {
      try {
        const existing = await this.client
          .talk(["/interface/list/member/print", `?list=${list}`, `?interface=${iface}`])
          .catch(() => []);
        if (existing.length > 0) {
          messages.push(`${iface} already in list ${list} — skipped`);
          continue;
        }
        await this.client.talk([
          "/interface/list/member/add",
          `=list=${list}`,
          `=interface=${iface}`,
        ]);
        messages.push(`Added ${iface} to list ${list}`);
      } catch (err) {
        ok = false;
        messages.push(`${iface} -> ${list}: ${errMsg(err)}`);
      }
    }
    return this.record("createInterfaceLists", ok, false, messages.join("; "));
  }

  /** 4 — attach physical/WiFi ports to HOTSPOT, and the veth to DOCKERS. */
  async assignBridgePorts() {
    const { hotspotBridgeName, hotspotBridgePorts, dockerBridgeName, vethName } = this.config;
    const messages: string[] = [];
    let ok = true;

    const attach = async (bridge: string, iface: string) => {
      try {
        const existing = await this.client
          .talk(["/interface/bridge/port/print", `?interface=${iface}`])
          .catch(() => []);
        if (existing.some((row) => row.bridge === bridge)) {
          messages.push(`${iface} already on bridge ${bridge} — skipped`);
          return;
        }
        await this.client.talk([
          "/interface/bridge/port/add",
          `=bridge=${bridge}`,
          `=interface=${iface}`,
        ]);
        messages.push(`Attached ${iface} to ${bridge}`);
      } catch (err) {
        ok = false;
        messages.push(`${iface} -> ${bridge}: ${errMsg(err)}`);
      }
    };

    for (const port of hotspotBridgePorts) {
      await attach(hotspotBridgeName, port);
    }
    await attach(dockerBridgeName, vethName);

    return this.record("assignBridgePorts", ok, false, messages.join("; "));
  }

  /** 5 — gateway addresses for both bridges. */
  async configureIPAddresses() {
    const { hotspotAddress, hotspotPrefixBits, hotspotBridgeName, vethGateway, dockerBridgeName } =
      this.config;
    const messages: string[] = [];
    let ok = true;

    const ensureAddress = async (address: string, prefixBits: number, iface: string) => {
      try {
        const existing = await this.client
          .talk(["/ip/address/print", `?interface=${iface}`])
          .catch(() => []);
        if (existing.length > 0) {
          messages.push(`${iface} already has an address (${existing[0].address}) — skipped`);
          return;
        }
        await this.client.talk([
          "/ip/address/add",
          `=address=${address}/${prefixBits}`,
          `=interface=${iface}`,
        ]);
        messages.push(`Added ${address}/${prefixBits} on ${iface}`);
      } catch (err) {
        ok = false;
        messages.push(`${iface}: ${errMsg(err)}`);
      }
    };

    await ensureAddress(hotspotAddress, hotspotPrefixBits, hotspotBridgeName);
    await ensureAddress(vethGateway, 28, dockerBridgeName);

    return this.record("configureIPAddresses", ok, false, messages.join("; "));
  }

  /** 6 — DHCP client on WAN, DHCP server + pool + network on HOTSPOT. */
  async configureDHCP() {
    const {
      wanInterfaceName,
      hotspotBridgeName,
      hotspotAddress,
      hotspotPrefixBits,
      dhcpPoolName,
      dhcpPoolRanges,
      dhcpServerName,
    } = this.config;
    const messages: string[] = [];
    let ok = true;

    try {
      const existingClient = await this.client
        .talk(["/ip/dhcp-client/print", `?interface=${wanInterfaceName}`])
        .catch(() => []);
      if (existingClient.length > 0) {
        messages.push("DHCP client on WAN already exists — skipped");
      } else {
        await this.client.talk([
          "/ip/dhcp-client/add",
          `=interface=${wanInterfaceName}`,
          "=use-peer-dns=yes",
          "=use-peer-ntp=yes",
          "=add-default-route=yes",
        ]);
        messages.push(`Added DHCP client on ${wanInterfaceName}`);
      }
    } catch (err) {
      ok = false;
      messages.push(`DHCP client: ${errMsg(err)}`);
    }

    try {
      if (await this.existsByName("/ip/pool", dhcpPoolName)) {
        messages.push(`Pool ${dhcpPoolName} already exists — skipped`);
      } else {
        await this.client.talk([
          "/ip/pool/add",
          `=name=${dhcpPoolName}`,
          `=ranges=${dhcpPoolRanges}`,
        ]);
        messages.push(`Created pool ${dhcpPoolName} (${dhcpPoolRanges})`);
      }
    } catch (err) {
      ok = false;
      messages.push(`Pool: ${errMsg(err)}`);
    }

    try {
      if (await this.existsByName("/ip/dhcp-server", dhcpServerName)) {
        messages.push(`DHCP server ${dhcpServerName} already exists — skipped`);
      } else {
        await this.client.talk([
          "/ip/dhcp-server/add",
          `=name=${dhcpServerName}`,
          `=interface=${hotspotBridgeName}`,
          `=address-pool=${dhcpPoolName}`,
        ]);
        messages.push(`Created DHCP server ${dhcpServerName} on ${hotspotBridgeName}`);
      }
    } catch (err) {
      ok = false;
      messages.push(`DHCP server: ${errMsg(err)}`);
    }

    try {
      const networkAddress = networkAddressFor(hotspotAddress, hotspotPrefixBits);
      const existingNetwork = await this.client
        .talk(["/ip/dhcp-server/network/print", `?address=${networkAddress}/${hotspotPrefixBits}`])
        .catch(() => []);
      if (existingNetwork.length > 0) {
        messages.push(`DHCP network ${networkAddress}/${hotspotPrefixBits} already exists — skipped`);
      } else {
        await this.client.talk([
          "/ip/dhcp-server/network/add",
          `=address=${networkAddress}/${hotspotPrefixBits}`,
          `=gateway=${hotspotAddress}`,
          `=netmask=${hotspotPrefixBits}`,
          `=dns-server=${hotspotAddress},1.1.1.1`,
        ]);
        messages.push(`Created DHCP network ${networkAddress}/${hotspotPrefixBits}`);
      }
    } catch (err) {
      ok = false;
      messages.push(`DHCP network: ${errMsg(err)}`);
    }

    return this.record("configureDHCP", ok, false, messages.join("; "));
  }

  /** 7 — static DNS servers + remote requests. */
  async configureDNS() {
    const { dnsServers } = this.config;
    try {
      await this.client.talk([
        "/ip/dns/set",
        "=allow-remote-requests=yes",
        `=servers=${dnsServers}`,
      ]);
      return this.record("configureDNS", true, false, `DNS set to ${dnsServers}`);
    } catch (err) {
      return this.record("configureDNS", false, false, errMsg(err));
    }
  }

  /** 8 — masquerade for the hotspot subnet (and Docker subnet). */
  async configureNAT() {
    const { hotspotAddress, hotspotPrefixBits, dockerBridgeName, vethGateway } = this.config;
    const messages: string[] = [];
    let ok = true;
    const networkAddress = networkAddressFor(hotspotAddress, hotspotPrefixBits);
    const dockerNetwork = `${vethGateway.split(".").slice(0, 3).join(".")}.0/28`;

    const ensureMasquerade = async (srcAddress: string, comment: string) => {
      try {
        const existing = await this.client
          .talk(["/ip/firewall/nat/print", `?src-address=${srcAddress}`, "?action=masquerade"])
          .catch(() => []);
        if (existing.length > 0) {
          messages.push(`Masquerade for ${srcAddress} already exists — skipped`);
          return;
        }
        await this.client.talk([
          "/ip/firewall/nat/add",
          "=chain=srcnat",
          `=src-address=${srcAddress}`,
          "=action=masquerade",
          `=comment=${comment}`,
        ]);
        messages.push(`Added masquerade for ${srcAddress}`);
      } catch (err) {
        ok = false;
        messages.push(`${srcAddress}: ${errMsg(err)}`);
      }
    };

    await ensureMasquerade(`${networkAddress}/${hotspotPrefixBits}`, "masquerade hotspot network");
    await ensureMasquerade(dockerNetwork, "Docker NAT");

    void dockerBridgeName;
    return this.record("configureNAT", ok, false, messages.join("; "));
  }

  /** 9 — MikroTik Cloud DDNS, so the router stays reachable behind CGNAT. */
  async configureCloudDDNS() {
    const { enableCloudDdns } = this.config;
    if (!enableCloudDdns) {
      return this.record("configureCloudDDNS", true, true, "Disabled in config — skipped");
    }
    try {
      await this.client.talk(["/ip/cloud/set", "=ddns-enabled=yes"]);
      return this.record("configureCloudDDNS", true, false, "DDNS enabled");
    } catch (err) {
      return this.record("configureCloudDDNS", false, false, errMsg(err));
    }
  }

  /** 10 — service hardening, timezone, identity, NTP, and the cleanup job. */
  async applyHardening() {
    const { disableSsh, disableApiSsl, timezone, identity, ntpServers } = this.config;
    const messages: string[] = [];
    let ok = true;

    if (disableSsh) {
      try {
        await this.client.talk(["/ip/service/set", "=numbers=ssh", "=disabled=yes"]);
        messages.push("ssh disabled");
      } catch (err) {
        ok = false;
        messages.push(`ssh: ${errMsg(err)}`);
      }
    }
    if (disableApiSsl) {
      try {
        await this.client.talk(["/ip/service/set", "=numbers=api-ssl", "=disabled=yes"]);
        messages.push("api-ssl disabled");
      } catch (err) {
        ok = false;
        messages.push(`api-ssl: ${errMsg(err)}`);
      }
    }

    try {
      await this.client.talk(["/system/clock/set", `=time-zone-name=${timezone}`]);
      messages.push(`timezone set to ${timezone}`);
    } catch (err) {
      ok = false;
      messages.push(`timezone: ${errMsg(err)}`);
    }

    try {
      await this.client.talk(["/system/identity/set", `=name=${identity}`]);
      messages.push(`identity set to ${identity}`);
    } catch (err) {
      ok = false;
      messages.push(`identity: ${errMsg(err)}`);
    }

    try {
      await this.client.talk(["/system/ntp/client/set", "=enabled=yes"]);
      for (const server of ntpServers) {
        const existing = await this.client
          .talk(["/system/ntp/client/servers/print", `?address=${server}`])
          .catch(() => []);
        if (existing.length > 0) {
          messages.push(`NTP server ${server} already configured — skipped`);
          continue;
        }
        await this.client.talk(["/system/ntp/client/servers/add", `=address=${server}`]);
        messages.push(`Added NTP server ${server}`);
      }
    } catch (err) {
      ok = false;
      messages.push(`NTP: ${errMsg(err)}`);
    }

    // CLEAN_JOB: the manual run hit "failure: item with this name already
    // exists" because it never checked first — find-before-add fixes that.
    try {
      if (await this.existsByName("/system/scheduler", "CLEAN_JOB")) {
        messages.push("CLEAN_JOB already exists — skipped");
      } else {
        await this.client.talk([
          "/system/scheduler/add",
          "=name=CLEAN_JOB",
          "=interval=1d",
          '=on-event=/sys sch rem [find where owner="sys"]; /sys scr job rem [find where owner="sys"]',
          "=policy=ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon",
          "=start-date=jan/01/2024",
          "=start-time=00:00:05",
        ]);
        messages.push("Created CLEAN_JOB scheduler");
      }
    } catch (err) {
      ok = false;
      messages.push(`CLEAN_JOB: ${errMsg(err)}`);
    }

    return this.record("applyHardening", ok, false, messages.join("; "));
  }

  /** Runs every step in order and returns a JSON-serializable summary. */
  async run() {
    this.results = [];
    try {
      await this.connect();
      await this.renameWAN();
      await this.createVETH();
      await this.createBridges();
      await this.createInterfaceLists();
      await this.assignBridgePorts();
      await this.configureIPAddresses();
      await this.configureDHCP();
      await this.configureDNS();
      await this.configureNAT();
      await this.configureCloudDDNS();
      await this.applyHardening();
    } finally {
      await this.disconnect();
    }

    const success = this.results.every((r) => r.ok);
    return {
      success,
      identity: this.config.identity,
      steps: this.results,
    };
  }
}

function errMsg(err: unknown) {
  return err instanceof Error ? err.message : "error";
}

/** "10.0.0.1" + 16 -> "10.0.0.0" (masks the host bits past prefixBits). */
function networkAddressFor(address: string, prefixBits: number) {
  const octets = address.split(".").map(Number);
  const fullOctets = Math.floor(prefixBits / 8);
  const remainderBits = prefixBits % 8;
  for (let i = 0; i < 4; i++) {
    if (i < fullOctets) continue;
    if (i === fullOctets && remainderBits > 0) {
      const mask = (0xff << (8 - remainderBits)) & 0xff;
      octets[i] &= mask;
    } else {
      octets[i] = 0;
    }
  }
  return octets.join(".");
}
