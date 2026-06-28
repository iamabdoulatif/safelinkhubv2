#!/usr/bin/env node
/**
 * safelinkhub-auto-provision.js
 * ------------------------------------------------------------------------
 * Standalone, idempotent MikroTik provisioner for SafeLinkHub hotspot
 * routers. Reproduces — exactly, with the values below kept as defaults
 * rather than hardcoded — the full manual WinBox playbook captured from a
 * real hAP ax² (C52iG-5HaxD2HaxD) export, including the MikHmon Docker
 * container.
 *
 * Library: `routeros-client` (https://www.npmjs.com/package/routeros-client)
 *   npm install routeros-client
 *
 * Usage:
 *   node safelinkhub-auto-provision.js
 *   (reads connection + config from environment variables — see .env.example)
 *
 * Or from another script:
 *   const { SafeLinkHubMikroTikProvisioner } = require('./safelinkhub-auto-provision');
 *   const provisioner = new SafeLinkHubMikroTikProvisioner({ host, port, username, password });
 *   const report = await provisioner.run();
 *
 * IDEMPOTENCE
 * Every step that creates a named object (bridge, interface list, pool,
 * profile, NAT rule, scheduler job, ...) looks it up with `.find()` first
 * and only adds it if missing — re-running the whole script against an
 * already-provisioned router is a no-op, not an error. `set`-style steps
 * (renaming ether1, configuring wifi, hardening services, clock/identity/
 * NTP) are naturally idempotent: applying the same values twice is harmless.
 * ------------------------------------------------------------------------
 */

"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- standalone CommonJS Node script, not bundled by Next.js */

const { RouterOSClient } = require("routeros-client");

// ---------------------------------------------------------------------------
// Default configuration — every value here is a parameter, not a hardcoded
// constant. Override any of them via the `config` object passed to the
// constructor (see README.md / .env.example for the env-var equivalents).
// ---------------------------------------------------------------------------
const DEFAULT_CONFIG = {
  // WiFi
  ssid: "DU BONHEUR WIFI",
  // SafeLinkHub's primary market — matches the fix already applied in the
  // live web app's container-setup.ts (was defaulting to "United States",
  // which left WiFi radios unable to transmit for most operators here).
  wifiCountry: "Ivory Coast",
  wifiDisabled: "no",

  // Hotspot
  hotspotProfileName: "DUBONHEUR",
  dnsName: "dubonheur.ci",
  htmlDirectory: "DUBONHEUR",
  httpCookieLifetime: "52w1d",
  hotspotUsers: ["admin", "president01@"],

  // System
  identity: "HSPT-DUBONHEUR",
  timezone: "Africa/Abidjan",

  // Networking
  wanInterface: "E1-WAN-FAI",
  defaultWAN: "ether1",
  lanBridgeName: "HOTSPOT",
  lanBridgePorts: ["ether2", "ether3", "ether4", "ether5", "wifi1", "wifi2"],
  lanAddress: "10.0.0.1/8",
  lanNetwork: "10.0.0.0",
  dhcpPoolName: "POOL-HOTSPOT",
  dhcpPoolRange: "10.0.0.2-10.255.255.254",
  dhcpServerName: "dhcp1",
  dnsServers: ["208.67.222.222", "8.8.8.8"],
  ntpServers: ["196.200.131.160", "196.10.52.57"],

  // Container / Docker (MikHmon)
  containerBridgeName: "DOCKERS",
  vethName: "MIKHMON",
  containerIP: "11.11.11.11/28",
  containerGateway: "11.11.11.1",
  containerNetwork: "11.11.11.0",
  containerVethMac: "60:6B:5F:65:F4:8C",
  containerMac: "60:6B:5F:65:F4:8D",
  // Matches the audited MikHmon v3 image the live web app provisions
  // (container-setup.ts) — the old mikhmon-sf-v1 image is no longer
  // maintained/pulled.
  containerName: "mikhmonv3-safelinkhub:latest",
  containerImage: "latif225/mikhmonv3-safelinkhub:latest",
  containerLayerDir: "/flash/mikhmon-app",
  containerRootDir: "/mikhmon-app",
  containerRegistryUrl: "https://registry-1.docker.io",
  containerTmpdir: "/tmp",
  containerLayerDirConfig: "/flash/mikhmon-layers",

  // NAT / remote access ports
  remoteAccessPort: 8088, // public WAN port -> MikHmon UI (ACCES DISTANT)
  dockerWebPort: 8087, // public port reachable via the hotspot gateway IP -> MikHmon UI

  // Disk
  tmpfsSlot: "tmp",
  tmpfsMaxSize: "150000000",

  // Hardening / API access
  userGroupName: "safelinkhub-group",
  userGroupPolicy:
    "read,write,test,sensitive,api,!local,!telnet,!ssh,!ftp,!reboot,!policy,!winbox,!password,!web,!sniff,!romon,!rest-api",
  wwwPort: 85,

  // Misc
  schedulerCleanJobName: "CLEAN_JOB",
  exportScriptName: "export-all",
};

function log(label, ...args) {
   
  console.log(`[${new Date().toISOString()}] ${label}`, ...args);
}

class SafeLinkHubMikroTikProvisioner {
  /**
   * @param {object} config
   * @param {string} config.host
   * @param {number} [config.port=8729] API-SSL port. Use 8728 for plain API.
   * @param {string} config.username
   * @param {string} config.password
   * @param {boolean} [config.tls=true] Whether to use API-SSL (port 8729) or plain API.
   * @param {object} [config.overrides] Any DEFAULT_CONFIG keys to override.
   */
  constructor(config = {}) {
    if (!config.host || !config.username || !config.password) {
      throw new Error("host, username and password are required.");
    }
    this.connection = {
      host: config.host,
      port: config.port ?? 8729,
      username: config.username,
      password: config.password,
      tls: config.tls ?? true,
    };
    this.cfg = { ...DEFAULT_CONFIG, ...(config.overrides || {}) };
    this.client = null;
    this.api = null;
    this.report = { steps: {}, errors: [] };
  }

  // -------------------------------------------------------------------------
  // Connection
  // -------------------------------------------------------------------------
  async connect() {
    log("connect", `Connecting to ${this.connection.host}:${this.connection.port} ...`);
    this.client = new RouterOSClient({
      host: this.connection.host,
      user: this.connection.username,
      password: this.connection.password,
      port: this.connection.port,
      tls: this.connection.tls ? {} : undefined,
      timeout: 15,
    });
    this.api = await this.client.connect();
    log("connect", "Connected.");
  }

  async disconnect() {
    if (this.client) {
      await this.client.close().catch(() => {});
      log("disconnect", "Connection closed.");
    }
  }

  // -------------------------------------------------------------------------
  // Generic idempotent helper — reproduces the pattern requested in the
  // brief: find() before add()/update().
  // -------------------------------------------------------------------------
  async ensureResource(menuPath, findQuery, createParams, updateParams = null) {
    const menu = this.api.menu(menuPath);
    const existing = await menu.find(findQuery).catch(() => []);

    if (existing && existing.length > 0) {
      if (updateParams) {
        await menu.update(existing[0][".id"], updateParams);
        return { action: "updated", id: existing[0][".id"] };
      }
      return { action: "exists", id: existing[0][".id"] };
    }

    const created = await menu.add(createParams);
    return { action: "created", id: created };
  }

  async runStep(name, fn, critical = false) {
    const t0 = Date.now();
    try {
      const result = await fn();
      this.report.steps[name] = { status: "ok", durationMs: Date.now() - t0, ...result };
      log(name, "OK", result ?? "");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.report.steps[name] = { status: "error", error: message, durationMs: Date.now() - t0 };
      this.report.errors.push({ step: name, error: message });
      log(name, "FAILED:", message);
      if (critical) throw err;
    }
  }

  // -------------------------------------------------------------------------
  // 1. Disk / tmpfs
  // -------------------------------------------------------------------------
  async setupDisk() {
    const result = await this.ensureResource(
      "/disk",
      { slot: this.cfg.tmpfsSlot },
      {
        slot: this.cfg.tmpfsSlot,
        type: "tmpfs",
        "tmpfs-max-size": this.cfg.tmpfsMaxSize,
      },
    );
    return { tmpfsSlot: this.cfg.tmpfsSlot, ...result };
  }

  // -------------------------------------------------------------------------
  // 2. Bridges (HOTSPOT + DOCKERS) — must exist before bridge ports.
  // -------------------------------------------------------------------------
  async setupBridges() {
    const created = [];
    for (const name of [this.cfg.containerBridgeName, this.cfg.lanBridgeName]) {
      const res = await this.ensureResource("/interface/bridge", { name }, { name });
      if (res.action === "created") created.push(name);
    }
    return { created, bridges: [this.cfg.containerBridgeName, this.cfg.lanBridgeName] };
  }

  // -------------------------------------------------------------------------
  // 3. Rename ether1 -> WAN interface name
  // -------------------------------------------------------------------------
  async renameWAN() {
    const menu = this.api.menu("/interface/ethernet");

    const already = await menu.find({ name: this.cfg.wanInterface }).catch(() => []);
    if (already.length > 0) {
      return { action: "exists", name: this.cfg.wanInterface };
    }

    const defaultIface = await menu.find({ "default-name": this.cfg.defaultWAN }).catch(() => []);
    if (defaultIface.length === 0) {
      // Already renamed in a previous run under a different default-name
      // search, or the board has no ether1 — not fatal, just nothing to do.
      return { action: "skipped", reason: `${this.cfg.defaultWAN} not found` };
    }

    await menu.update(defaultIface[0][".id"], { name: this.cfg.wanInterface });
    return { action: "renamed", from: this.cfg.defaultWAN, to: this.cfg.wanInterface };
  }

  // -------------------------------------------------------------------------
  // 4. WiFi radios (2.4GHz + 5GHz, same SSID)
  // -------------------------------------------------------------------------
  async setupWiFi() {
    const menu = this.api.menu("/interface/wifi");
    const radios = [
      {
        defaultName: "wifi1",
        params: {
          "channel.band": "5ghz-ax",
          "channel.skip-dfs-channels": "all",
          "channel.width": "20/40/80mhz",
          "configuration.country": this.cfg.wifiCountry,
          "configuration.mode": "ap",
          "configuration.ssid": this.cfg.ssid,
          disabled: this.cfg.wifiDisabled,
        },
      },
      {
        defaultName: "wifi2",
        params: {
          "channel.band": "2ghz-ax",
          "channel.skip-dfs-channels": "all",
          "channel.width": "20/40mhz",
          "configuration.country": this.cfg.wifiCountry,
          "configuration.mode": "ap",
          "configuration.ssid": this.cfg.ssid,
          disabled: this.cfg.wifiDisabled,
        },
      },
    ];

    const applied = [];
    for (const radio of radios) {
      const rows = await menu.find({ "default-name": radio.defaultName }).catch(() => []);
      if (rows.length === 0) {
        // Board doesn't have this radio (e.g. single-band boards) — skip it.
        continue;
      }
      await menu.update(rows[0][".id"], radio.params);
      applied.push(radio.defaultName);
    }

    return { ssid: this.cfg.ssid, country: this.cfg.wifiCountry, radios: applied };
  }

  // -------------------------------------------------------------------------
  // 5. VETH interface for the Docker container — must exist before the
  //    container itself.
  // -------------------------------------------------------------------------
  async createVETH() {
    const result = await this.ensureResource(
      "/interface/veth",
      { name: this.cfg.vethName },
      {
        name: this.cfg.vethName,
        address: this.cfg.containerIP,
        gateway: this.cfg.containerGateway,
        "gateway6": "",
        dhcp: "no",
        "mac-address": this.cfg.containerVethMac,
        "container-mac-address": this.cfg.containerMac,
      },
    );
    return { name: this.cfg.vethName, ip: this.cfg.containerIP, ...result };
  }

  // -------------------------------------------------------------------------
  // 6. Interface lists (WAN / LAN) + members
  // -------------------------------------------------------------------------
  async setupInterfaceLists() {
    for (const name of ["WAN", "LAN"]) {
      await this.ensureResource("/interface/list", { name }, { name });
    }

    const memberships = [
      ["WAN", this.cfg.wanInterface],
      ["LAN", this.cfg.lanBridgeName],
    ];
    for (const [list, iface] of memberships) {
      await this.ensureResource(
        "/interface/list/member",
        { list, interface: iface },
        { list, interface: iface },
      );
    }
    return { lists: ["WAN", "LAN"], memberships };
  }

  // -------------------------------------------------------------------------
  // 7. Bridge ports — requires bridges (step 2) and VETH (step 5) to exist.
  // -------------------------------------------------------------------------
  async assignBridgePorts() {
    const attached = [];
    for (const iface of this.cfg.lanBridgePorts) {
      const res = await this.ensureResource(
        "/interface/bridge/port",
        { bridge: this.cfg.lanBridgeName, interface: iface },
        { bridge: this.cfg.lanBridgeName, interface: iface },
      );
      if (res.action === "created") attached.push(iface);
    }
    const dockerRes = await this.ensureResource(
      "/interface/bridge/port",
      { bridge: this.cfg.containerBridgeName, interface: this.cfg.vethName },
      { bridge: this.cfg.containerBridgeName, interface: this.cfg.vethName },
    );
    if (dockerRes.action === "created") attached.push(this.cfg.vethName);
    return { attached };
  }

  // -------------------------------------------------------------------------
  // 8. IP addresses — requires the interfaces from steps 2-5 to exist.
  // -------------------------------------------------------------------------
  async setupIPAddresses() {
    await this.ensureResource(
      "/ip/address",
      { interface: this.cfg.lanBridgeName },
      { address: this.cfg.lanAddress, interface: this.cfg.lanBridgeName, network: this.cfg.lanNetwork },
    );
    await this.ensureResource(
      "/ip/address",
      { interface: this.cfg.containerBridgeName },
      {
        address: this.cfg.containerIP.replace(/\.\d+\//, ".1/"), // gateway address, e.g. 11.11.11.1/28
        interface: this.cfg.containerBridgeName,
        network: this.cfg.containerNetwork,
      },
    );
    return {
      hotspot: `${this.cfg.lanAddress} on ${this.cfg.lanBridgeName}`,
      container: `${this.cfg.containerGateway}/${this.cfg.containerIP.split("/")[1]} on ${this.cfg.containerBridgeName}`,
    };
  }

  // -------------------------------------------------------------------------
  // 9. IP Cloud (DDNS)
  // -------------------------------------------------------------------------
  async setupCloudDDNS() {
    await this.api.menu("/ip/cloud").update({ "ddns-enabled": "yes" });
    return { ddnsEnabled: true };
  }

  // -------------------------------------------------------------------------
  // 10. DHCP client on WAN
  // -------------------------------------------------------------------------
  async setupDHCPClient() {
    const result = await this.ensureResource(
      "/ip/dhcp-client",
      { interface: this.cfg.wanInterface },
      { interface: this.cfg.wanInterface, name: "client1" },
    );
    return { interface: this.cfg.wanInterface, ...result };
  }

  // -------------------------------------------------------------------------
  // 11. IP pool
  // -------------------------------------------------------------------------
  async setupIPPool() {
    const result = await this.ensureResource(
      "/ip/pool",
      { name: this.cfg.dhcpPoolName },
      { name: this.cfg.dhcpPoolName, ranges: this.cfg.dhcpPoolRange },
      { ranges: this.cfg.dhcpPoolRange },
    );
    return { name: this.cfg.dhcpPoolName, ranges: this.cfg.dhcpPoolRange, ...result };
  }

  // -------------------------------------------------------------------------
  // 12. DHCP server + network
  // -------------------------------------------------------------------------
  async setupDHCPServer() {
    await this.ensureResource(
      "/ip/dhcp-server",
      { name: this.cfg.dhcpServerName },
      {
        name: this.cfg.dhcpServerName,
        interface: this.cfg.lanBridgeName,
        "address-pool": this.cfg.dhcpPoolName,
      },
    );

    const [networkAddress, prefixBits] = this.cfg.lanAddress.split("/");
    const network = `${this.cfg.lanNetwork}/${prefixBits}`;
    await this.ensureResource(
      "/ip/dhcp-server/network",
      { address: network },
      {
        address: network,
        gateway: networkAddress,
        netmask: prefixBits,
        "dns-server": [networkAddress, "1.1.1.1"].join(","),
      },
    );
    return { server: this.cfg.dhcpServerName, network };
  }

  // -------------------------------------------------------------------------
  // 13. DNS
  // -------------------------------------------------------------------------
  async setupDNS() {
    await this.api.menu("/ip/dns").update({
      "allow-remote-requests": "yes",
      servers: this.cfg.dnsServers.join(","),
    });
    return { servers: this.cfg.dnsServers };
  }

  // -------------------------------------------------------------------------
  // 14. Firewall filter — placeholder rule reserved for hotspot's own
  //     auto-generated rules.
  // -------------------------------------------------------------------------
  async setupFirewallFilter() {
    const result = await this.ensureResource(
      "/ip/firewall/filter",
      { "chain": "unused-hs-chain", "comment": "place hotspot rules here" },
      {
        chain: "unused-hs-chain",
        action: "passthrough",
        comment: "place hotspot rules here",
        disabled: "yes",
      },
    );
    return result;
  }

  // -------------------------------------------------------------------------
  // 15. Firewall mangle — anti ICS/connection-sharing TTL rewrite.
  // -------------------------------------------------------------------------
  async setupFirewallMangle() {
    const result = await this.ensureResource(
      "/ip/firewall/mangle",
      { chain: "postrouting", "out-interface": this.cfg.lanBridgeName, action: "change-ttl" },
      {
        chain: "postrouting",
        action: "change-ttl",
        "new-ttl": "set:1",
        "out-interface": this.cfg.lanBridgeName,
        passthrough: "no",
      },
    );
    return result;
  }

  // -------------------------------------------------------------------------
  // 16. Firewall NAT — WAN masquerade, hotspot masquerade, Docker
  //     masquerade + remote-access dst-nat rules.
  // -------------------------------------------------------------------------
  async setupFirewallNAT() {
    await this.ensureResource(
      "/ip/firewall/nat",
      { chain: "unused-hs-chain", comment: "place hotspot rules here" },
      {
        chain: "unused-hs-chain",
        action: "passthrough",
        comment: "place hotspot rules here",
        disabled: "yes",
      },
    );
    await this.ensureResource(
      "/ip/firewall/nat",
      { chain: "srcnat", "out-interface": this.cfg.wanInterface, comment: "" },
      { chain: "srcnat", action: "masquerade", "out-interface": this.cfg.wanInterface },
    );
    await this.ensureResource(
      "/ip/firewall/nat",
      { chain: "srcnat", comment: "masquerade hotspot network" },
      {
        chain: "srcnat",
        action: "masquerade",
        comment: "masquerade hotspot network",
        "src-address": this.cfg.lanAddress.replace(/\.\d+\//, ".0/"),
      },
    );
    const containerCidr = `${this.cfg.containerNetwork}/${this.cfg.containerIP.split("/")[1]}`;
    await this.ensureResource(
      "/ip/firewall/nat",
      { chain: "srcnat", comment: "Docker NAT", action: "masquerade" },
      { chain: "srcnat", action: "masquerade", comment: "Docker NAT", "src-address": containerCidr },
    );
    await this.ensureResource(
      "/ip/firewall/nat",
      { chain: "dstnat", comment: "ACCES DISTANT" },
      {
        chain: "dstnat",
        action: "dst-nat",
        comment: "ACCES DISTANT",
        "dst-port": String(this.cfg.remoteAccessPort),
        protocol: "tcp",
        "to-addresses": this.cfg.containerIP.split("/")[0],
        "to-ports": "80",
      },
    );
    await this.ensureResource(
      "/ip/firewall/nat",
      { chain: "dstnat", comment: "Docker NAT", action: "dst-nat" },
      {
        chain: "dstnat",
        action: "dst-nat",
        comment: "Docker NAT",
        "dst-address": this.cfg.lanAddress.split("/")[0],
        "dst-port": String(this.cfg.dockerWebPort),
        protocol: "tcp",
        "to-addresses": this.cfg.containerIP.split("/")[0],
        "to-ports": "80",
      },
    );
    return {
      remoteAccessPort: this.cfg.remoteAccessPort,
      dockerWebPort: this.cfg.dockerWebPort,
    };
  }

  // -------------------------------------------------------------------------
  // 17. Hotspot profile
  // -------------------------------------------------------------------------
  async setupHotspotProfile() {
    const result = await this.ensureResource(
      "/ip/hotspot/profile",
      { name: this.cfg.hotspotProfileName },
      {
        name: this.cfg.hotspotProfileName,
        "dns-name": this.cfg.dnsName,
        "hotspot-address": this.cfg.lanAddress.split("/")[0],
        "html-directory": this.cfg.htmlDirectory,
        "html-directory-override": this.cfg.htmlDirectory,
        "http-cookie-lifetime": this.cfg.httpCookieLifetime,
        "install-hotspot-queue": "yes",
        "login-by": "mac,cookie,http-chap,http-pap,mac-cookie",
        "mac-auth-mode": "mac-as-username-and-password",
      },
      {
        "dns-name": this.cfg.dnsName,
        "hotspot-address": this.cfg.lanAddress.split("/")[0],
        "html-directory": this.cfg.htmlDirectory,
        "html-directory-override": this.cfg.htmlDirectory,
      },
    );
    return { profile: this.cfg.hotspotProfileName, dnsName: this.cfg.dnsName, ...result };
  }

  // -------------------------------------------------------------------------
  // 18. Hotspot server
  // -------------------------------------------------------------------------
  async setupHotspot() {
    const result = await this.ensureResource(
      "/ip/hotspot",
      { name: "hotspot1" },
      {
        name: "hotspot1",
        interface: this.cfg.lanBridgeName,
        "address-pool": this.cfg.dhcpPoolName,
        "addresses-per-mac": "1",
        disabled: "no",
        profile: this.cfg.hotspotProfileName,
      },
    );
    return { name: "hotspot1", ...result };
  }

  // -------------------------------------------------------------------------
  // 19. Default hotspot users
  // -------------------------------------------------------------------------
  async setupHotspotUsers() {
    const created = [];
    for (const name of this.cfg.hotspotUsers) {
      const res = await this.ensureResource("/ip/hotspot/user", { name }, { name });
      if (res.action === "created") created.push(name);
    }
    return { users: this.cfg.hotspotUsers, created };
  }

  // -------------------------------------------------------------------------
  // 20. Service hardening
  // -------------------------------------------------------------------------
  async hardenServices() {
    const menu = this.api.menu("/ip/service");
    const settings = [
      { name: "ssh", params: { disabled: "yes" } },
      { name: "telnet", params: { disabled: "yes" } },
      { name: "www", params: { port: String(this.cfg.wwwPort) } },
      { name: "api-ssl", params: { disabled: "yes" } },
    ];
    for (const { name, params } of settings) {
      const rows = await menu.find({ name }).catch(() => []);
      if (rows.length > 0) await menu.update(rows[0][".id"], params);
    }
    return { ssh: "disabled", telnet: "disabled", www: `port ${this.cfg.wwwPort}`, "api-ssl": "disabled" };
  }

  // -------------------------------------------------------------------------
  // 21. Clock / timezone
  // -------------------------------------------------------------------------
  async setupClock() {
    await this.api.menu("/system/clock").update({ "time-zone-name": this.cfg.timezone });
    return { timezone: this.cfg.timezone };
  }

  // -------------------------------------------------------------------------
  // 22. Identity
  // -------------------------------------------------------------------------
  async setupIdentity() {
    await this.api.menu("/system/identity").update({ name: this.cfg.identity });
    return { identity: this.cfg.identity };
  }

  // -------------------------------------------------------------------------
  // 23. NTP client
  // -------------------------------------------------------------------------
  async setupNTP() {
    await this.api.menu("/system/ntp/client").update({ enabled: "yes" });
    const added = [];
    for (const address of this.cfg.ntpServers) {
      const res = await this.ensureResource(
        "/system/ntp/client/servers",
        { address },
        { address },
      );
      if (res.action === "created") added.push(address);
    }
    return { servers: this.cfg.ntpServers, added };
  }

  // -------------------------------------------------------------------------
  // 24. Scheduler — CLEAN_JOB. The manual run in the source video failed
  //     with "failure: item with this name already exists" because it
  //     never checked first; ensureResource() fixes that.
  // -------------------------------------------------------------------------
  async setupScheduler() {
    const result = await this.ensureResource(
      "/system/scheduler",
      { name: this.cfg.schedulerCleanJobName },
      {
        name: this.cfg.schedulerCleanJobName,
        interval: "1d",
        "on-event": '/sys sch rem [find where on-event=""];\r\n/sys scr job rem [find where owner~"sys"]',
        policy: "ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon",
        "start-date": "jan/01/2024",
        "start-time": "00:00:05",
      },
    );
    return { name: this.cfg.schedulerCleanJobName, ...result };
  }

  // -------------------------------------------------------------------------
  // 25. User group scoped for the SaaS API connection
  // -------------------------------------------------------------------------
  async setupUserGroup() {
    const result = await this.ensureResource(
      "/user/group",
      { name: this.cfg.userGroupName },
      { name: this.cfg.userGroupName, policy: this.cfg.userGroupPolicy },
      { policy: this.cfg.userGroupPolicy },
    );
    return { name: this.cfg.userGroupName, ...result };
  }

  // -------------------------------------------------------------------------
  // 26. Export-all system script (manual backup helper)
  // -------------------------------------------------------------------------
  async setupExportScript() {
    const source = [
      ":local date [/system clock get date]",
      ":local time [/system clock get time]",
      '  :local filename ("backup-" . [:pick $date 7 11] . "-" . [:pick $date 0 3] . [:pick $date 4 6])',
      "",
      "  /export compact file=$filename",
      '  /ip hotspot export file=("hotspot-" . $filename)',
      '  /ip firewall nat export file=("nat-" . $filename)',
      '  /ip firewall filter export file=("filter-" . $filename)',
      "",
      '  :log info ("Export termine : " . $filename)',
    ].join("\n");

    const result = await this.ensureResource(
      "/system/script",
      { name: this.cfg.exportScriptName },
      {
        name: this.cfg.exportScriptName,
        "dont-require-permissions": "no",
        owner: this.connection.username,
        policy: "ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon",
        source,
      },
      { source },
    );
    return { name: this.cfg.exportScriptName, ...result };
  }

  // -------------------------------------------------------------------------
  // 27. PARTIE CRITIQUE — MikHmon container. Runs last: needs the VETH
  //     (step 5), the DOCKERS bridge (step 2), and its IP (step 8).
  // -------------------------------------------------------------------------
  async setupContainer() {
    // 1. Package check
    const packages = await this.api.menu("/system/package").find({ name: "container" }).catch(() => []);
    if (packages.length === 0) {
      return {
        status: "skipped",
        reason: "The 'container' package is not installed on this RouterOS device.",
      };
    }
    if (packages[0].disabled === "true") {
      return {
        status: "skipped",
        reason: "The 'container' package is installed but disabled — enable it and reboot first.",
      };
    }

    // 2. Registry / engine config
    await this.api.menu("/container/config").update({
      "registry-url": this.cfg.containerRegistryUrl,
      tmpdir: this.cfg.containerTmpdir,
      "layer-dir": this.cfg.containerLayerDirConfig,
    });

    // 3. Does the container already exist?
    const containerMenu = this.api.menu("/container");
    let existing = await containerMenu.find({ name: this.cfg.containerName }).catch(() => []);

    if (existing.length === 0) {
      // 4. Create it — requires VETH + DOCKERS bridge + IP to already exist.
      await containerMenu.add({
        interface: this.cfg.vethName,
        name: this.cfg.containerName,
        "remote-image": this.cfg.containerImage,
        "layer-dir": this.cfg.containerLayerDir,
        "root-dir": this.cfg.containerRootDir,
        "start-on-boot": "yes",
      });
      log("setupContainer", "Container created — image pull in progress in the background.");
    } else if (existing[0].status === "stopped") {
      // 5. Existing but stopped -> start it.
      await containerMenu.update(existing[0][".id"], {});
      await this.api.menu("/container").exec?.("start", { numbers: existing[0][".id"] }).catch(() => {});
      log("setupContainer", "Container existed but was stopped — start requested.");
    }

    // 6. Re-check status after a short wait for the image pull / boot.
    await new Promise((resolve) => setTimeout(resolve, 30000));
    existing = await containerMenu.find({ name: this.cfg.containerName }).catch(() => []);
    const status = existing[0]?.status ?? "unknown";

    return {
      status: status === "running" ? "ok" : "pending",
      name: this.cfg.containerName,
      image: this.cfg.containerImage,
      running: status === "running",
      reportedStatus: status,
      note:
        status !== "running"
          ? "Large images can take several minutes to pull on slow WAN links — start-on-boot=yes guarantees it comes up eventually even if this check ran too early."
          : undefined,
    };
  }

  // -------------------------------------------------------------------------
  // Orchestration
  // -------------------------------------------------------------------------
  async run() {
    const t0 = Date.now();
    this.report = { success: true, host: this.connection.host, steps: {}, errors: [] };

    await this.runStep("connect", () => this.connect(), true);

    await this.runStep("disk", () => this.setupDisk());
    await this.runStep("bridges", () => this.setupBridges(), true);
    await this.runStep("renameWAN", () => this.renameWAN());
    await this.runStep("wifi", () => this.setupWiFi());
    await this.runStep("veth", () => this.createVETH(), true);
    await this.runStep("interfaceLists", () => this.setupInterfaceLists());
    await this.runStep("bridgePorts", () => this.assignBridgePorts());
    await this.runStep("ipAddresses", () => this.setupIPAddresses());
    await this.runStep("cloudDdns", () => this.setupCloudDDNS());
    await this.runStep("dhcpClient", () => this.setupDHCPClient());
    await this.runStep("ipPool", () => this.setupIPPool());
    await this.runStep("dhcpServer", () => this.setupDHCPServer());
    await this.runStep("dns", () => this.setupDNS());
    await this.runStep("firewallFilter", () => this.setupFirewallFilter());
    await this.runStep("firewallMangle", () => this.setupFirewallMangle());
    await this.runStep("firewallNat", () => this.setupFirewallNAT());
    await this.runStep("hotspotProfile", () => this.setupHotspotProfile());
    await this.runStep("hotspot", () => this.setupHotspot());
    await this.runStep("hotspotUsers", () => this.setupHotspotUsers());
    await this.runStep("hardening", () => this.hardenServices());
    await this.runStep("clock", () => this.setupClock());
    await this.runStep("identity", () => this.setupIdentity());
    await this.runStep("ntp", () => this.setupNTP());
    await this.runStep("scheduler", () => this.setupScheduler());
    await this.runStep("userGroup", () => this.setupUserGroup());
    await this.runStep("exportScript", () => this.setupExportScript());
    await this.runStep("container", () => this.setupContainer());

    await this.disconnect();

    this.report.identity = this.cfg.identity;
    this.report.success = this.report.errors.length === 0;
    this.report.durationMs = Date.now() - t0;
    return this.report;
  }
}

// ---------------------------------------------------------------------------
// CLI entry point — reads connection info from environment variables so the
// script can be run directly with `node safelinkhub-auto-provision.js` after
// `cp .env.example .env` and filling in real values (see README.md).
// ---------------------------------------------------------------------------
async function main() {
  require("dotenv").config();

  const overrides = {};
  for (const key of Object.keys(DEFAULT_CONFIG)) {
    const envKey = `MIKROTIK_${key.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase()}`;
    if (process.env[envKey] !== undefined) {
      const raw = process.env[envKey];
      if (Array.isArray(DEFAULT_CONFIG[key])) {
        overrides[key] = raw.split(",").map((v) => v.trim());
      } else if (typeof DEFAULT_CONFIG[key] === "number") {
        overrides[key] = Number(raw);
      } else {
        overrides[key] = raw;
      }
    }
  }

  const provisioner = new SafeLinkHubMikroTikProvisioner({
    host: process.env.MIKROTIK_HOST,
    port: process.env.MIKROTIK_PORT ? Number(process.env.MIKROTIK_PORT) : 8729,
    username: process.env.MIKROTIK_USERNAME,
    password: process.env.MIKROTIK_PASSWORD,
    tls: process.env.MIKROTIK_TLS !== "false",
    overrides,
  });

  const report = await provisioner.run();
   
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.success ? 0 : 1;
}

if (require.main === module) {
  main().catch((err) => {
     
    console.error("Fatal error:", err);
    process.exitCode = 1;
  });
}

module.exports = { SafeLinkHubMikroTikProvisioner, DEFAULT_CONFIG };
