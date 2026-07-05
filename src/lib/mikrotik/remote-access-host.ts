// Browser-accessed services (WebFig, MikHmon) can't be reached over a raw
// HTTP port anymore: modern browsers' HTTPS-First mode upgrades every
// navigation to https, and a plain iptables DNAT port speaks HTTP only, so
// the TLS handshake is closed (ERR_CONNECTION_CLOSED). Instead they're served
// through the relay's Traefik on 443 with a wildcard *.<base> certificate, at
// a stable per-router subdomain. WinBox/SSH keep their raw host:port forwards
// — native apps, not affected by HTTPS-First.

/** Services whose remote access is a browser page (must go over HTTPS). */
export const WEB_ACCESS_SERVICES = new Set(["webfig", "mikhmon"]);

export function isWebAccessService(service: string): boolean {
  return WEB_ACCESS_SERVICES.has(service);
}

/**
 * Stable, deterministic label for a router+service, shared by the UI (URL it
 * shows) and the Traefik dynamic config generator (host it routes). Derived
 * from the last octet of the WireGuard tunnel IP, which is unique per router
 * and stable for the life of the tunnel — e.g. 10.66.0.5 + mikhmon → r5-mikhmon.
 */
export function webAccessSubdomain(tunnelIp: string, service: string): string {
  const octet = tunnelIp.split(".").pop() ?? "0";
  return `r${octet}-${service}`;
}

/** Full HTTPS host, e.g. r5-mikhmon.safelinkhub.io. */
export function webAccessHost(tunnelIp: string, service: string, baseDomain: string): string {
  return `${webAccessSubdomain(tunnelIp, service)}.${baseDomain}`;
}
