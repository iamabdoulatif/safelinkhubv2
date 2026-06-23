"use server";

import { randomInt } from "crypto";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { personalVpnAccess } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import { decryptSecret, encryptSecret } from "./crypto";
import {
  allocateOpenvpnPeer,
  allocateVpnPeer,
  getOpenvpnCaCertificate,
  revokeOpenvpnPeer,
  revokeVpnPeer,
} from "./relay";

/**
 * Generates a personal WireGuard / OpenVPN client config that lets an admin
 * join the SafeLinkHub VPN relay from their own computer (any OS, any
 * network) and reach every connected router's tunnel IP directly — e.g. to
 * open WinBox or SSH straight into a MikroTik without going through the
 * app's own SSH-forwarding relay code. These peers are provisioned exactly
 * like router peers (same relay-side allocator); this module additionally
 * persists them so they can be listed and revoked from /admin/remote-access.
 */

const PLACE_WORDS = [
  "abidjan",
  "korhogo",
  "bouake",
  "yamoussoukro",
  "daloa",
  "man",
  "gagnoa",
  "soubre",
  "divo",
  "sanpedro",
];

function randomOpenvpnUsername() {
  const word = PLACE_WORDS[Math.floor(Math.random() * PLACE_WORDS.length)];
  const suffix = randomInt(1000, 9999);
  // Cosmetic, email-style identifier — not a real domain, just an opaque
  // login string the relay's OpenVPN auth script compares verbatim.
  return `${word}${suffix}@safelinkhub.id`;
}

function randomDisplayPort() {
  return randomInt(40000, 59999);
}

export async function listPersonalVpnAccess() {
  const session = await getSession();
  if (!session) return [];

  const db = getDb();
  const rows = await db
    .select()
    .from(personalVpnAccess)
    .where(eq(personalVpnAccess.orgId, session.orgId));

  return rows
    .map((r) => ({
      id: r.id,
      label: r.label,
      method: r.method,
      username: r.username,
      password: r.passwordEncrypted ? decryptSecret(r.passwordEncrypted) : null,
      vpnIp: r.vpnIp,
      remoteHost: r.remoteHost,
      remotePort: r.remotePort,
      displayPort: r.displayPort,
      status: r.status,
      autoRenew: r.autoRenew,
      createdAt: r.createdAt,
      expiresAt: r.expiresAt,
    }))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

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

  const vpnIp = peer.peerAddress.split("/")[0];
  const [endpointHost, endpointPort] = peer.endpoint.split(":");

  const db = getDb();
  await db.insert(personalVpnAccess).values({
    orgId: session.orgId,
    label,
    method: "wireguard",
    peerPublicKey: peer.peerPublicKey,
    vpnIp,
    remoteHost: endpointHost,
    remotePort: Number(endpointPort),
    status: "active",
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  });

  const content = `[Interface]
PrivateKey = ${peer.peerPrivateKey}
Address = ${peer.peerAddress}

[Peer]
PublicKey = ${peer.serverPublicKey}
Endpoint = ${peer.endpoint}
AllowedIPs = 10.66.0.0/24
PersistentKeepalive = 25
`;

  revalidatePath("/admin/remote-access");
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

  const username = randomOpenvpnUsername();

  let peer;
  let caCert: string;
  try {
    peer = await allocateOpenvpnPeer(username);
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
  const displayPort = randomDisplayPort();

  const db = getDb();
  const [row] = await db
    .insert(personalVpnAccess)
    .values({
      orgId: session.orgId,
      label,
      method: "openvpn",
      username: peer.username,
      passwordEncrypted: encryptSecret(peer.password),
      vpnIp: peer.clientIp,
      remoteHost: host,
      remotePort: Number(port),
      displayPort,
      status: "active",
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    })
    .returning();

  const command = `/interface ovpn-client add connect-to=${host} port=${port} protocol=udp name=${peer.username} user=${peer.username} password=${peer.password} comment=${host}:${displayPort}<->8291`;

  const content = `client
dev tun
proto udp
remote ${host} ${port}
resolv-retry infinite
nobind
persist-key
persist-tun
remote-cert-tls server
data-ciphers AES-256-GCM:AES-128-GCM
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

  revalidatePath("/admin/remote-access");
  return {
    success: true,
    fileName: `safelinkhub-${label.replace(/[^a-zA-Z0-9_-]/g, "-")}.ovpn`,
    content,
    command,
    accessId: row.id,
  };
}

export async function revokePersonalVpnAccess(accessId: string) {
  const session = await getSession();
  if (!session) return { error: "Not authenticated." };

  const db = getDb();
  const [row] = await db
    .select()
    .from(personalVpnAccess)
    .where(eq(personalVpnAccess.id, accessId))
    .limit(1);

  if (!row || row.orgId !== session.orgId) {
    return { error: "Access not found." };
  }
  if (row.status === "revoked") {
    return { success: true };
  }

  try {
    if (row.method === "wireguard" && row.peerPublicKey) {
      await revokeVpnPeer(row.peerPublicKey);
    } else if (row.method === "openvpn" && row.username) {
      await revokeOpenvpnPeer(row.username);
    }
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? `Could not revoke on the relay: ${err.message}`
          : "Could not revoke on the relay.",
    };
  }

  await db
    .update(personalVpnAccess)
    .set({ status: "revoked", revokedAt: new Date() })
    .where(eq(personalVpnAccess.id, accessId));

  revalidatePath("/admin/remote-access");
  return { success: true };
}

export async function updatePersonalVpnAccess(
  accessId: string,
  updates: { label?: string; autoRenew?: boolean; expiresAt?: string | null },
) {
  const session = await getSession();
  if (!session) return { error: "Not authenticated." };

  const db = getDb();
  const [row] = await db
    .select()
    .from(personalVpnAccess)
    .where(eq(personalVpnAccess.id, accessId))
    .limit(1);

  if (!row || row.orgId !== session.orgId) {
    return { error: "Access not found." };
  }

  const label = updates.label?.trim();
  if (label !== undefined && !label) {
    return { error: "Label cannot be empty." };
  }

  await db
    .update(personalVpnAccess)
    .set({
      ...(label ? { label } : {}),
      ...(updates.autoRenew !== undefined ? { autoRenew: updates.autoRenew } : {}),
      ...(updates.expiresAt !== undefined
        ? { expiresAt: updates.expiresAt ? new Date(updates.expiresAt) : null }
        : {}),
    })
    .where(eq(personalVpnAccess.id, accessId));

  revalidatePath("/admin/remote-access");
  return { success: true };
}

export async function deletePersonalVpnAccess(accessId: string) {
  const session = await getSession();
  if (!session) return { error: "Not authenticated." };

  const db = getDb();
  const [row] = await db
    .select()
    .from(personalVpnAccess)
    .where(eq(personalVpnAccess.id, accessId))
    .limit(1);

  if (!row || row.orgId !== session.orgId) {
    return { error: "Access not found." };
  }

  if (row.status !== "revoked") {
    try {
      if (row.method === "wireguard" && row.peerPublicKey) {
        await revokeVpnPeer(row.peerPublicKey);
      } else if (row.method === "openvpn" && row.username) {
        await revokeOpenvpnPeer(row.username);
      }
    } catch (err) {
      return {
        error:
          err instanceof Error
            ? `Could not revoke on the relay: ${err.message}`
            : "Could not revoke on the relay.",
      };
    }
  }

  await db.delete(personalVpnAccess).where(eq(personalVpnAccess.id, accessId));

  revalidatePath("/admin/remote-access");
  return { success: true };
}
