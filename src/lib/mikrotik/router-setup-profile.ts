export const ROUTER_SETUP_PROFILE = {
  referenceDevice: "hAP ax^2",
  routerosVersion: "7.23.1",
  architecture: "arm64",
  identityPrefix: "HSPT",
  wanInterface: "E1-WAN-FAI",
  hotspotBridge: {
    name: "HOTSPOT",
    gateway: "10.0.0.1/8",
    poolName: "POOL-HOTSPOT",
    poolRange: "10.0.0.2-10.255.255.254",
    dhcpServerName: "dhcp1",
    leaseTime: "30m",
    dnsServers: "10.0.0.1,1.1.1.1",
    ports: ["ether2", "ether3", "ether4", "ether5", "wifi1", "wifi2"],
  },
  containerBridge: {
    name: "DOCKERS",
    gateway: "11.11.11.1/28",
    network: "11.11.11.0/28",
    vethName: "MIKHMON",
    vethAddress: "11.11.11.11/28",
    image: "latif225/mikhmonv3-safelinkhub:latest",
    remoteAccessPort: 8088,
    localWebPort: 8087,
  },
  dnsResolvers: "208.67.222.222,8.8.8.8",
  management: {
    apiPort: 8728,
    winboxPort: 8291,
    webfigPort: 85,
    // ssh is scoped to the VPN tunnel subnet instead of disabled when the
    // router is connected via WireGuard/OpenVPN — SFTP (FileZilla) rides
    // on that same service — and only fully disabled on a direct/LAN
    // connection, where there's no tunnel subnet to scope it to.
    disabledServices: ["telnet", "api-ssl"],
  },
  timezone: "Africa/Abidjan",
  ntpServers: ["196.200.131.160", "196.10.52.57"],
} as const;

export function getRouterSetupChecklist() {
  const profile = ROUTER_SETUP_PROFILE;

  return [
    `Profil de référence : ${profile.referenceDevice}, RouterOS ${profile.routerosVersion}, ${profile.architecture}.`,
    `WAN : ${profile.wanInterface} avec client DHCP et masquerade.`,
    `Hotspot : bridge ${profile.hotspotBridge.name} en ${profile.hotspotBridge.gateway}, pool ${profile.hotspotBridge.poolRange}.`,
    `Ports LAN/WiFi : ${profile.hotspotBridge.ports.join(", ")} vers ${profile.hotspotBridge.name}.`,
    `MikHmon : bridge ${profile.containerBridge.name}, veth ${profile.containerBridge.vethName} ${profile.containerBridge.vethAddress}, image ${profile.containerBridge.image}.`,
    `Accès MikHmon : port distant ${profile.containerBridge.remoteAccessPort} et port local ${profile.containerBridge.localWebPort}.`,
    `Gestion : API ${profile.management.apiPort}, Winbox ${profile.management.winboxPort}, WebFig ${profile.management.webfigPort}.`,
  ];
}
