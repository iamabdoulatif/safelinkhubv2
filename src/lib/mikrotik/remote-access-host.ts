// Browser-accessed services (WebFig, MikHmon) can't be reached over a raw
// HTTP port: modern browsers' HTTPS-First mode upgrades every navigation to
// https, and a plain iptables DNAT port speaks HTTP only, so the TLS
// handshake is closed (ERR_CONNECTION_CLOSED). Instead the relay's nginx
// terminates TLS on the forward's public port (wildcard *.<base> cert) and
// proxies to the router — the URL stays sN.<base>:<port>, just over https.
// WinBox/SSH keep their raw host:port DNAT forwards (native apps, unaffected).

/** Services whose remote access is a browser page (must go over HTTPS). */
export const WEB_ACCESS_SERVICES = new Set(["webfig", "mikhmon"]);

export function isWebAccessService(service: string): boolean {
  return WEB_ACCESS_SERVICES.has(service);
}
