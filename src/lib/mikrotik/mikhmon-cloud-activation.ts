export type MikhmonCloudTunnel = {
  id: "wireguard" | "openvpn" | null;
  label: "WireGuard" | "OpenVPN" | "Tunnel SafeLinkHub requis";
  routerOsRange: "RouterOS 7.0 à 7.24.1" | "RouterOS 6.x" | null;
  ready: boolean;
};

/**
 * The VPN used for a cloud-hosted MikHmon instance is determined by the
 * existing managed tunnel. We never swap a live router between protocols from
 * the UI: RouterOS 7 boards keep their WireGuard tunnel and RouterOS 6 boards
 * keep OpenVPN. A direct connection cannot host this no-container flow.
 */
export function resolveMikhmonCloudTunnel(
  connectionMethod: string | null | undefined,
  tunnelIp?: string | null,
): MikhmonCloudTunnel {
  if (tunnelIp !== undefined && !tunnelIp?.trim()) {
    return {
      id: null,
      label: "Tunnel SafeLinkHub requis",
      routerOsRange: null,
      ready: false,
    };
  }

  if (connectionMethod === "vpn") {
    return {
      id: "wireguard",
      label: "WireGuard",
      routerOsRange: "RouterOS 7.0 à 7.24.1",
      ready: true,
    };
  }

  if (connectionMethod === "openvpn") {
    return {
      id: "openvpn",
      label: "OpenVPN",
      routerOsRange: "RouterOS 6.x",
      ready: true,
    };
  }

  return {
    id: null,
    label: "Tunnel SafeLinkHub requis",
    routerOsRange: null,
    ready: false,
  };
}
