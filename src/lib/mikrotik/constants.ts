// Shared constants — kept in a plain module (no "use server") so they can be
// imported by both server-action files and the "use server" exports rule
// ("only async functions may be exported") doesn't apply here.

// Public port the "ACCES DISTANT" dst-nat rule forwards to the MikHmon
// container, opened directly on the router's own WAN by provisionHotspotStack.
// Reachable from anywhere (no dst-address filter on the NAT rule) via the
// router's own public IP or MikroTik Cloud DDNS name.
export const REMOTE_ACCESS_PORT = 8088;

// Port the "Docker NAT" dst-nat rule forwards to the MikHmon container, but
// scoped to dst-address=<hotspot gateway IP> — only reachable from inside
// the hotspot's own LAN/WiFi, not from the public internet.
export const DOCKER_WEB_PORT = 8087;

// LAN bridge name provisionHotspotStack builds — needed here to look up the
// hotspot gateway's current IP address for the local MikHmon link.
export const HOTSPOT_BRIDGE_NAME = "HOTSPOT";

// Port the "MikHmon via tunnel" dst-nat rule forwards to the MikHmon
// container, with no dst-address filter so it answers regardless of which
// address the packet arrives addressed to (WAN public IP or the router's
// own WireGuard/OpenVPN tunnel address) — used by the no-VPN direct-access
// relay (port-forward.ts) to reach MikHmon through the same tunnel already
// used for WinBox/WebFig/SSH, bypassing WAN-side CGNAT entirely since the
// relay talks to the router over the tunnel, never over the public WAN.
export const TUNNEL_ACCESS_PORT = 8089;
