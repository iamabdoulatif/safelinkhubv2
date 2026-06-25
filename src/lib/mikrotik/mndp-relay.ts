"use server";

import { eq, and, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { routers, personalVpnAccess, organizations } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import { connectToRouter } from "./router-sync";
import { runOnRelay } from "./relay";

/**
 * MikroTik's MNDP (Neighbor Discovery, UDP port 5678) is what makes a
 * router show up in WinBox's "Neighbors" list — but it only ever travels
 * over an actual broadcast-capable L2 segment. ZeroTier emulates a real L2
 * switch, so it carries MNDP broadcasts across the internet for free;
 * WireGuard/OpenVPN are pure L3 routed tunnels and never will.
 *
 * To get the same "just appears in Neighbors" experience over our own
 * WireGuard/OpenVPN relay, this module runs a small Python daemon on the
 * EC2 relay box that: reads a JSON file of {router metadata} x {admin VPN
 * peer IPs}, and every few seconds crafts a real MNDP packet per router and
 * sends it as plain UDP *unicast* straight to each peer's tunnel IP on port
 * 5678. WinBox's listener doesn't care whether the packet arrived as a
 * broadcast or a unicast — it just parses whatever lands on that port — so
 * each peer's WinBox shows every router as if freshly discovered on its
 * own LAN.
 *
 * The MNDP wire format below (TLV type numbers, uptime byte order) is
 * community-reverse-engineered, not published by MikroTik — if a field
 * doesn't render right in WinBox, capture the real packets from a
 * ZeroTier-connected router with Wireshark's "mndp" dissector and compare.
 */

const RELAY_DIR = "/opt/safelinkhub";
const CONFIG_DIR = "/etc/safelinkhub";
const TARGETS_FILE = `${CONFIG_DIR}/mndp-targets.json`;
const DAEMON_PATH = `${RELAY_DIR}/mndp-relay.py`;
const SERVICE_NAME = "safelinkhub-mndp-relay";

const DAEMON_SOURCE = `#!/usr/bin/env python3
"""SafeLinkHub MNDP relay — see src/lib/mikrotik/mndp-relay.ts for context."""
import json
import socket
import struct
import time

TARGETS_FILE = "/etc/safelinkhub/mndp-targets.json"
MNDP_PORT = 5678
POLL_SECONDS = 5

TYPE_MAC = 1
TYPE_IDENTITY = 5
TYPE_VERSION = 7
TYPE_PLATFORM = 8
TYPE_UPTIME = 10
TYPE_SOFTWARE_ID = 11
TYPE_BOARD = 12
TYPE_UNPACK = 14
TYPE_IPV4 = 17


def tlv(type_id: int, value: bytes) -> bytes:
    return struct.pack(">HH", type_id, len(value)) + value


def mac_to_bytes(mac: str) -> bytes:
    try:
        parts = [int(x, 16) for x in mac.split(":")]
        if len(parts) == 6:
            return bytes(parts)
    except Exception:
        pass
    return b"\\x00\\x00\\x00\\x00\\x00\\x00"


def build_packet(router: dict) -> bytes:
    chunks = [struct.pack(">H", 0)]
    chunks.append(tlv(TYPE_MAC, mac_to_bytes(router.get("mac", ""))))
    identity = (router.get("identity") or "MikroTik").encode("utf-8")
    chunks.append(tlv(TYPE_IDENTITY, identity))
    chunks.append(tlv(TYPE_VERSION, (router.get("version") or "").encode("utf-8")))
    chunks.append(tlv(TYPE_PLATFORM, b"MikroTik"))
    uptime = int(router.get("uptimeSeconds") or 0) & 0xFFFFFFFF
    chunks.append(tlv(TYPE_UPTIME, struct.pack(">I", uptime)))
    chunks.append(tlv(TYPE_SOFTWARE_ID, identity))
    chunks.append(tlv(TYPE_BOARD, (router.get("board") or "").encode("utf-8")))
    chunks.append(tlv(TYPE_UNPACK, b"\\x00"))
    tunnel_ip = router.get("tunnelIp")
    if tunnel_ip:
        try:
            chunks.append(tlv(TYPE_IPV4, socket.inet_aton(tunnel_ip)))
        except OSError:
            pass
    return b"".join(chunks)


def load_targets():
    try:
        with open(TARGETS_FILE, "r") as f:
            data = json.load(f)
            return data.get("routers", []), data.get("peers", [])
    except Exception:
        return [], []


def main():
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
    while True:
        routers_list, peers = load_targets()
        for router in routers_list:
            try:
                packet = build_packet(router)
            except Exception:
                continue
            for peer_ip in peers:
                try:
                    sock.sendto(packet, (peer_ip, MNDP_PORT))
                except OSError:
                    pass
        time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    main()
`;

const SYSTEMD_UNIT = `[Unit]
Description=SafeLinkHub MNDP relay (WinBox Neighbors over VPN)
After=network.target

[Service]
ExecStart=/usr/bin/python3 ${DAEMON_PATH}
Restart=always
RestartSec=5
User=root

[Install]
WantedBy=multi-user.target
`;

/**
 * One-time (but idempotent — safe to call again any time) setup: writes the
 * daemon + systemd unit to the relay and starts it. Requires python3 on the
 * relay box, which ships by default on the Ubuntu/Debian images this relay
 * already runs (no extra runtime install needed, unlike Node.js).
 */
export async function deployMndpRelay() {
  const session = await getSession();
  if (!session) return { error: "Not authenticated." };

  try {
    const daemonB64 = Buffer.from(DAEMON_SOURCE, "utf8").toString("base64");
    const unitB64 = Buffer.from(SYSTEMD_UNIT, "utf8").toString("base64");

    await runOnRelay(
      `sudo mkdir -p ${RELAY_DIR} ${CONFIG_DIR} && ` +
        `[ -f ${TARGETS_FILE} ] || echo '{"routers":[],"peers":[]}' | sudo tee ${TARGETS_FILE} >/dev/null && ` +
        `echo ${daemonB64} | base64 -d | sudo tee ${DAEMON_PATH} >/dev/null && ` +
        `sudo chmod +x ${DAEMON_PATH} && ` +
        `echo ${unitB64} | base64 -d | sudo tee /etc/systemd/system/${SERVICE_NAME}.service >/dev/null && ` +
        `sudo systemctl daemon-reload && sudo systemctl enable --now ${SERVICE_NAME}`,
      30000,
    );
    return { success: true, message: "Relais MNDP déployé et démarré sur le serveur relay." };
  } catch (err) {
    return {
      error: err instanceof Error ? `Deploy failed: ${err.message}` : "Deploy failed.",
    };
  }
}

export async function getMndpRelayStatus() {
  const session = await getSession();
  if (!session) return { error: "Not authenticated." };
  try {
    const output = await runOnRelay(
      `systemctl is-active ${SERVICE_NAME} 2>/dev/null || echo inactive`,
      10000,
    );
    return { success: true, active: output.trim() === "active" };
  } catch (err) {
    return {
      error: err instanceof Error ? `Status check failed: ${err.message}` : "Status check failed.",
    };
  }
}

/**
 * Refreshes the targets file the daemon reads from: every online VPN/OpenVPN
 * router's live identity/version/board/MAC/uptime, announced to every
 * active personal VPN access peer in the same org. Call this after any
 * change to either side (router connects, personal access granted/revoked)
 * and periodically from the health-check cron so uptime stays fresh.
 */
export async function syncMndpAnnouncements(orgId: string) {
  const db = getDb();

  const candidateRouters = await db
    .select()
    .from(routers)
    .where(
      and(
        eq(routers.orgId, orgId),
        eq(routers.status, "online"),
        inArray(routers.connectionMethod, ["vpn", "openvpn"]),
      ),
    );

  const routerTargets = (
    await Promise.all(
      candidateRouters
        .filter((r) => r.tunnelIp)
        .map(async (router) => {
          let client;
          try {
            client = await connectToRouter(router, 8000);
          } catch {
            return null;
          }
          try {
            const [resource] = await client.talk(["/system/resource/print"], 8000);
            const [identityRow] = await client.talk(["/system/identity/print"], 8000);
            const [ethernet] = await client.talk(["/interface/ethernet/print"], 8000).catch(() => []);
            return {
              identity: identityRow?.name || router.name,
              version: resource?.version ?? "",
              board: resource?.["board-name"] ?? router.model ?? "",
              mac: ethernet?.["mac-address"] ?? "",
              uptimeSeconds: router.uptimeSeconds ?? 0,
              tunnelIp: router.tunnelIp,
            };
          } catch {
            return null;
          } finally {
            client.close();
          }
        }),
    )
  ).filter((r): r is NonNullable<typeof r> => r !== null);

  const peerRows = await db
    .select({ vpnIp: personalVpnAccess.vpnIp })
    .from(personalVpnAccess)
    .where(and(eq(personalVpnAccess.orgId, orgId), eq(personalVpnAccess.status, "active")));
  const peers = peerRows.map((p) => p.vpnIp).filter((ip): ip is string => Boolean(ip));

  const payload = JSON.stringify({ routers: routerTargets, peers });
  const payloadB64 = Buffer.from(payload, "utf8").toString("base64");

  try {
    await runOnRelay(
      `sudo mkdir -p ${CONFIG_DIR} && echo ${payloadB64} | base64 -d | sudo tee ${TARGETS_FILE} >/dev/null`,
      15000,
    );
    return { success: true, routerCount: routerTargets.length, peerCount: peers.length };
  } catch (err) {
    return {
      error: err instanceof Error ? `Sync failed: ${err.message}` : "Sync failed.",
    };
  }
}

/** Used by the health-check cron, which doesn't have a session to scope to. */
export async function syncMndpAnnouncementsForAllOrgs() {
  const db = getDb();
  const orgRows = await db.select({ id: organizations.id }).from(organizations);
  const results = await Promise.all(
    orgRows.map((o) => syncMndpAnnouncements(o.id).catch((err) => ({ error: String(err) }))),
  );
  return { orgsProcessed: results.length };
}
