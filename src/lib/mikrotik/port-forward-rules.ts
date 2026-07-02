import { TUNNEL_ACCESS_PORT } from "./constants";

const SERVICE_PORTS: Record<string, number> = {
  winbox: 8291,
  webfig: 85,
  ssh: 22,
  mikhmon: TUNNEL_ACCESS_PORT,
};

const MIKHMON_TUNNEL_NAT_COMMENT = "MikHmon via tunnel";
const MIKHMON_CONTAINER_IP = "11.11.11.11";
const MIKHMON_CONTAINER_PORT = "80";
export const MIKHMON_DOCKER_GATEWAY_ADDRESS = "11.11.11.1/28";
export const MIKHMON_TUNNEL_INTERFACES = ["safelinkhub-wg0", "safelinkhub-ovpn"] as const;

const MIKHMON_TUNNEL_FIREWALL_COMMENT = "Allow MikHmon via SafeLinkHub tunnel";
const SSH_TUNNEL_FIREWALL_COMMENT = "Allow SSH/SFTP via SafeLinkHub tunnel";

export function getPortForwardTargetPort(service: string) {
  return SERVICE_PORTS[service] ?? null;
}

export function getMikhmonTunnelNatCommands() {
  return {
    findExisting: [
      "/ip/firewall/nat/print",
      "?chain=dstnat",
      "?action=dst-nat",
      `?comment=${MIKHMON_TUNNEL_NAT_COMMENT}`,
    ],
    add: [
      "/ip/firewall/nat/add",
      "=chain=dstnat",
      `=dst-port=${TUNNEL_ACCESS_PORT}`,
      "=protocol=tcp",
      "=action=dst-nat",
      `=to-addresses=${MIKHMON_CONTAINER_IP}`,
      `=to-ports=${MIKHMON_CONTAINER_PORT}`,
      `=comment=${MIKHMON_TUNNEL_NAT_COMMENT}`,
    ],
  };
}

export function getMikhmonTunnelFirewallCommands(
  tunnelInterface: (typeof MIKHMON_TUNNEL_INTERFACES)[number],
  placeBefore?: string,
) {
  const comment = `${MIKHMON_TUNNEL_FIREWALL_COMMENT} (${tunnelInterface})`;
  return {
    findExisting: [
      "/ip/firewall/filter/print",
      "?chain=forward",
      `?comment=${comment}`,
    ],
    add: [
      "/ip/firewall/filter/add",
      "=chain=forward",
      "=action=accept",
      "=protocol=tcp",
      `=in-interface=${tunnelInterface}`,
      `=dst-address=${MIKHMON_CONTAINER_IP}`,
      `=dst-port=${MIKHMON_CONTAINER_PORT}`,
      `=comment=${comment}`,
      ...(placeBefore ? [`=place-before=${placeBefore}`] : []),
    ],
  };
}

export function getSshTunnelFirewallCommands(
  tunnelInterface: (typeof MIKHMON_TUNNEL_INTERFACES)[number],
  placeBefore?: string,
) {
  const comment = `${SSH_TUNNEL_FIREWALL_COMMENT} (${tunnelInterface})`;
  return {
    findExisting: [
      "/ip/firewall/filter/print",
      "?chain=input",
      `?comment=${comment}`,
    ],
    add: [
      "/ip/firewall/filter/add",
      "=chain=input",
      "=action=accept",
      "=protocol=tcp",
      `=in-interface=${tunnelInterface}`,
      "=dst-port=22",
      `=comment=${comment}`,
      ...(placeBefore ? [`=place-before=${placeBefore}`] : []),
    ],
  };
}

export function getDockerBridgeCleanupCommands(bridgeName: string) {
  return {
    findGatewayAddress: [
      "/ip/address/print",
      `?interface=${bridgeName}`,
      `?address=${MIKHMON_DOCKER_GATEWAY_ADDRESS}`,
    ],
    removeGatewayAddress: (id: string) => ["/ip/address/remove", `=numbers=${id}`],
    findBridgePorts: [
      "/interface/bridge/port/print",
      `?bridge=${bridgeName}`,
    ],
    findBridge: ["/interface/bridge/print", `?name=${bridgeName}`],
    removeBridge: (id: string) => ["/interface/bridge/remove", `=numbers=${id}`],
  };
}
