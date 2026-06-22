"use server";

import { getSession } from "@/lib/auth/session";
import {
  allocateOpenvpnPeer,
  allocateVpnPeer,
  getOpenvpnCaCertificate,
} from "./relay";

/**
 * Generates a personal WireGuard / OpenVPN client config that lets an admin
 * join the SafeLinkHub VPN relay from their own computer (any OS, any
 * network) and reach every connected router's tunnel IP directly — e.g. to
 * open WinBox or SSH straight into a MikroTik without going through the
 * app's own SSH-forwarding relay code. These peers are provisioned exactly
 * like router peers (same relay-side allocator), just consumed as a
 * downloadable client file instead of being embedded in a RouterOS script.
 */
export async function generatePersonalWireguardAccess(
  _prevState: unknown,
  formData: FormData,
) {
  const session = await getSession();
  if (!session) return { error: "Not authenticated." };

  const label = String(formData.get("label") ?? "").trim();
  if (!label) return { error: "A label is required." };

  let peer;
  try {
    peer = await allocateVpnPeer(`human-${label}`);
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? `Could not allocate VPN access: ${err.message}`
          : "Could not allocate VPN access.",
    };
  }

  const content = `[Interface]
PrivateKey = ${peer.peerPrivateKey}
Address = ${peer.peerAddress}

[Peer]
PublicKey = ${peer.serverPublicKey}
Endpoint = ${peer.endpoint}
AllowedIPs = 10.66.0.0/24
PersistentKeepalive = 25
`;

  return {
    success: true,
    fileName: `safelinkhub-${label.replace(/[^a-zA-Z0-9_-]/g, "-")}.conf`,
    content,
  };
}

export async function generatePersonalOpenvpnAccess(
  _prevState: unknown,
  formData: FormData,
) {
  const session = await getSession();
  if (!session) return { error: "Not authenticated." };

  const label = String(formData.get("label") ?? "").trim();
  if (!label) return { error: "A label is required." };

  let peer;
  let caCert: string;
  try {
    peer = await allocateOpenvpnPeer(`human-${label}`);
    caCert = await getOpenvpnCaCertificate();
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? `Could not allocate VPN access: ${err.message}`
          : "Could not allocate VPN access.",
    };
  }

  const [host, port] = peer.endpoint.split(":");
  const content = `client
dev tun
proto udp
remote ${host} ${port}
resolv-retry infinite
nobind
persist-key
persist-tun
remote-cert-tls server
cipher AES-256-CBC
auth-nocache
verb 3

<ca>
${caCert.trim()}
</ca>

<auth-user-pass>
${peer.username}
${peer.password}
</auth-user-pass>
`;

  return {
    success: true,
    fileName: `safelinkhub-${label.replace(/[^a-zA-Z0-9_-]/g, "-")}.ovpn`,
    content,
  };
}
