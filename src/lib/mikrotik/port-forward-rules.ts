import { TUNNEL_ACCESS_PORT } from "./constants";

const SERVICE_PORTS: Record<string, number> = {
  winbox: 8291,
  webfig: 85,
  ssh: 22,
  mikhmon: TUNNEL_ACCESS_PORT,
};

const MIKHMON_TUNNEL_NAT_COMMENT = "MikHmon via tunnel";
/**
 * Adresse de la veth que SafeLinkHub crée lui-même pour MikHmon.
 *
 * Ce n'est qu'un DÉFAUT, jamais une certitude : un MikroTik peut porter un
 * conteneur MikHmon installé autrement (à la main, par un prestataire), sur une
 * autre veth et donc une autre adresse. Le dst-nat qui visait 11.11.11.11 en
 * dur tombait alors dans le vide, et l'accès distant expirait sans rien dire —
 * constaté sur SHIA-HSPT. L'adresse réelle est désormais LUE sur l'appareil,
 * voir resolveMikhmonContainerAddress.
 */
export const MIKHMON_DEFAULT_CONTAINER_IP = "11.11.11.11";
const MIKHMON_CONTAINER_PORT = "80";
export const MIKHMON_DOCKER_GATEWAY_ADDRESS = "11.11.11.1/28";
/** Noms d'interface tunnel POSÉS par SafeLinkHub — un défaut, pas une liste close. */
export const MIKHMON_TUNNEL_INTERFACES = ["safelinkhub-wg0", "safelinkhub-ovpn"] as const;

/**
 * Plan d'adressage des tunnels du relais : 10.66.0.0/24 (WireGuard, wg0) et
 * 10.67.0.0/24 (OpenVPN, tun0). Sert à retrouver l'interface tunnel D'APRÈS
 * L'ADRESSE qu'elle porte, quel que soit son nom.
 */
export const TUNNEL_ADDRESS_PLAN = /^10\.6[67]\./;

/** Interfaces du routeur portant une adresse du plan de tunnel. */
export function tunnelInterfacesFromAddresses(rows: Record<string, string>[]): string[] {
  const names = rows
    .filter((row) => TUNNEL_ADDRESS_PLAN.test(String(row.address ?? "")))
    .map((row) => String(row.interface ?? "").trim())
    .filter(Boolean);
  return [...new Set(names)];
}

const MIKHMON_TUNNEL_FIREWALL_COMMENT = "Allow MikHmon via SafeLinkHub tunnel";
const SSH_TUNNEL_FIREWALL_COMMENT = "Allow SSH/SFTP via SafeLinkHub tunnel";

export function getPortForwardTargetPort(service: string) {
  return SERVICE_PORTS[service] ?? null;
}

/** Ce qu'il faut lire pour retrouver l'adresse réelle du conteneur MikHmon. */
export function getMikhmonContainerDiscoveryCommands(vethName: string) {
  return {
    listContainers: ["/container/print"],
    findVeth: ["/interface/veth/print", `?name=${vethName}`],
  };
}

/** Un conteneur ressemble-t-il à MikHmon ? (même critère que l'audit) */
export function looksLikeMikhmonContainer(row: Record<string, string>) {
  return (
    /mikhmon/i.test(String(row.name ?? "")) ||
    /mikhmon/i.test(String(row["root-dir"] ?? "")) ||
    /mikhmon/i.test(String(row.tag ?? "")) ||
    /mikhmon/i.test(String(row.comment ?? ""))
  );
}

export function getMikhmonTunnelNatCommands(containerIp = MIKHMON_DEFAULT_CONTAINER_IP) {
  return {
    findExisting: [
      "/ip/firewall/nat/print",
      "?chain=dstnat",
      "?action=dst-nat",
      `?comment=${MIKHMON_TUNNEL_NAT_COMMENT}`,
    ],
    /** Redresse une règle existante qui viserait la mauvaise adresse. */
    retarget: (id: string) => [
      "/ip/firewall/nat/set",
      `=numbers=${id}`,
      `=to-addresses=${containerIp}`,
      `=to-ports=${MIKHMON_CONTAINER_PORT}`,
    ],
    add: [
      "/ip/firewall/nat/add",
      "=chain=dstnat",
      `=dst-port=${TUNNEL_ACCESS_PORT}`,
      "=protocol=tcp",
      "=action=dst-nat",
      `=to-addresses=${containerIp}`,
      `=to-ports=${MIKHMON_CONTAINER_PORT}`,
      `=comment=${MIKHMON_TUNNEL_NAT_COMMENT}`,
    ],
  };
}

export function getMikhmonTunnelFirewallCommands(
  tunnelInterface: string,
  placeBefore?: string,
  containerIp = MIKHMON_DEFAULT_CONTAINER_IP,
) {
  const comment = `${MIKHMON_TUNNEL_FIREWALL_COMMENT} (${tunnelInterface})`;
  return {
    findExisting: [
      "/ip/firewall/filter/print",
      "?chain=forward",
      `?comment=${comment}`,
    ],
    retarget: (id: string) => [
      "/ip/firewall/filter/set",
      `=numbers=${id}`,
      `=dst-address=${containerIp}`,
    ],
    add: [
      "/ip/firewall/filter/add",
      "=chain=forward",
      "=action=accept",
      "=protocol=tcp",
      `=in-interface=${tunnelInterface}`,
      `=dst-address=${containerIp}`,
      `=dst-port=${MIKHMON_CONTAINER_PORT}`,
      `=comment=${comment}`,
      ...(placeBefore ? [`=place-before=${placeBefore}`] : []),
    ],
  };
}

export function getSshTunnelFirewallCommands(
  tunnelInterface: string,
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
