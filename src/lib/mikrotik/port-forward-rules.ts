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
