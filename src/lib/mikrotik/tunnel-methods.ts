/**
 * Méthodes de connexion par TUNNEL : SafeLinkHub joint l'API du routeur à
 * travers le relais (redirection SSH vers l'IP du tunnel), jamais en direct.
 *
 *   - « vpn »     WireGuard — RouterOS 7 uniquement (UDP 51820).
 *   - « openvpn » OpenVPN   — RouterOS 6 et 7, TCP 1194.
 *   - « sstp »    SSTP      — RouterOS 6 et 7, TCP 443 : le seul qui passe les
 *     réseaux qui ne laissent sortir que le web (MALO-HOTSPOT, 25/09/2026 :
 *     1194, 993, 22 et 8443 refusés par le FAI, 443 ouvert).
 *
 * Un test « vpn || openvpn » oublié quelque part laisserait un routeur SSTP
 * injoignable ou mal configuré : tout passe par isTunnelMethod.
 */
export const TUNNEL_METHODS = ["vpn", "openvpn", "sstp"] as const;
export type TunnelMethod = (typeof TUNNEL_METHODS)[number];

export function isTunnelMethod(method: string | null | undefined): method is TunnelMethod {
  return (TUNNEL_METHODS as readonly string[]).includes(method ?? "");
}

/** Sous-réseau de chaque tunnel côté relais — c'est lui que l'API du routeur autorise. */
export const TUNNEL_SUBNETS: Record<TunnelMethod, string> = {
  vpn: "10.66.0.0/24",
  openvpn: "10.67.0.0/24",
  sstp: "192.168.200.0/24",
};

export function tunnelLabel(method: string | null | undefined): string {
  if (method === "vpn") return "WireGuard";
  if (method === "openvpn") return "OpenVPN";
  if (method === "sstp") return "SSTP";
  return "Direct";
}
