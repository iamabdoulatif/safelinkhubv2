import { Client } from "ssh2";
import { shardingEnabled, isShard, portRangeForShard } from "./shards";

export function normalizeRelayPublicHost(value: string | undefined | null): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  const withoutProtocol = trimmed.replace(/^https?:\/\//i, "");
  return withoutProtocol.split("/")[0].split(":")[0];
}

/**
 * Public hostname used to build direct-access URLs (`host:port`) and new
 * WireGuard endpoints. With sharding enabled (RELAY_BASE_DOMAIN set) and a
 * router's shard passed in, returns `<shard>.<RELAY_BASE_DOMAIN>` (e.g.
 * s2.safelinkhub.io); otherwise falls back to the single legacy relay host.
 * See lib/mikrotik/shards.ts for the gating.
 */
export function getRelayPublicHost(shard?: string | null): string {
  if (shardingEnabled() && isShard(shard)) {
    return `${shard}.${process.env.RELAY_BASE_DOMAIN}`;
  }
  return normalizeRelayPublicHost(process.env.WG_RELAY_PUBLIC_HOST || process.env.WG_RELAY_HOST);
}

function shellArg(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function getRelayPrivateKey(): string {
  const b64 = process.env.WG_RELAY_SSH_KEY_B64;
  if (!b64) throw new Error("WG_RELAY_SSH_KEY_B64 is not set");
  return Buffer.from(b64, "base64").toString("utf8");
}

export function runOnRelay(command: string, timeoutMs = 15000): Promise<string> {
  const host = process.env.WG_RELAY_HOST;
  const username = process.env.WG_RELAY_SSH_USER;
  if (!host || !username) {
    throw new Error("WG_RELAY_HOST / WG_RELAY_SSH_USER are not set");
  }

  return new Promise((resolve, reject) => {
    const conn = new Client();
    const timer = setTimeout(() => {
      conn.end();
      reject(new Error("SSH command timed out"));
    }, timeoutMs);

    let stdout = "";
    let stderr = "";

    conn
      .on("ready", () => {
        conn.exec(command, (err, stream) => {
          if (err) {
            clearTimeout(timer);
            conn.end();
            return reject(err);
          }
          stream
            .on("close", (code: number) => {
              clearTimeout(timer);
              conn.end();
              if (code !== 0) {
                reject(new Error(stderr.trim() || `Command exited with code ${code}`));
              } else {
                resolve(stdout);
              }
            })
            .on("data", (data: Buffer) => {
              stdout += data.toString();
            })
            .stderr.on("data", (data: Buffer) => {
              stderr += data.toString();
            });
        });
      })
      .on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      })
      .connect({
        host,
        username,
        privateKey: getRelayPrivateKey(),
        readyTimeout: timeoutMs,
      });
  });
}

export type VpnPeer = {
  peerPrivateKey: string;
  peerPublicKey: string;
  peerAddress: string; // e.g. "10.66.0.5/32"
  serverPublicKey: string;
  endpoint: string; // "host:port"
};

export async function allocateVpnPeer(name: string): Promise<VpnPeer> {
  const safeName = name.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 40) || "router";
  const publicHost = getRelayPublicHost();
  const output = await runOnRelay(`sudo bash -s -- ${shellArg(safeName)} ${shellArg(publicHost)} <<'SCRIPT'
set -euo pipefail
NAME="$1"
PUBLIC_HOST="$2"
cd /etc/wireguard

declare -A used
while read -r _peer allowed; do
  [ "$allowed" = "(none)" ] && continue
  octet="\${allowed#10.66.0.}"
  octet="\${octet%%/*}"
  if [[ "$octet" =~ ^[0-9]+$ ]]; then
    used[$octet]=1
  fi
done < <(wg show wg0 allowed-ips)

NEXT_OCTET=""
for octet in $(seq 2 254); do
  if [[ -z "\${used[$octet]+x}" ]]; then
    NEXT_OCTET="$octet"
    break
  fi
done
if [[ -z "$NEXT_OCTET" ]]; then
  echo "No available WireGuard peer address" >&2
  exit 1
fi

PEER_IP="10.66.0.\${NEXT_OCTET}/32"
PEER_PRIV=$(wg genkey)
PEER_PUB=$(echo "$PEER_PRIV" | wg pubkey)
SERVER_PUB=$(cat server_public.key)
SERVER_HOST="\${PUBLIC_HOST:-$(curl -fsS https://checkip.amazonaws.com)}"

wg set wg0 peer "$PEER_PUB" allowed-ips "$PEER_IP"
wg-quick save wg0 >/dev/null 2>&1 || true

echo "# Peer: \${NAME}"
echo "PeerPublicKey = \${PEER_PUB}"
echo "[Interface]"
echo "PrivateKey = \${PEER_PRIV}"
echo "Address = \${PEER_IP}"
echo ""
echo "[Peer]"
echo "PublicKey = \${SERVER_PUB}"
echo "Endpoint = \${SERVER_HOST}:51820"
echo "AllowedIPs = 10.66.0.0/24"
echo "PersistentKeepalive = 25"
SCRIPT`);

  const get = (key: string) => {
    const match = output.match(new RegExp(`^${key}\\s*=\\s*(.+)$`, "m"));
    if (!match) throw new Error(`Relay output missing ${key}`);
    return match[1].trim();
  };

  return {
    peerPrivateKey: get("PrivateKey"),
    peerPublicKey: get("PeerPublicKey"),
    peerAddress: get("Address"),
    serverPublicKey: get("PublicKey"),
    endpoint: get("Endpoint"),
  };
}

export async function revokeVpnPeer(peerPublicKey: string): Promise<void> {
  await runOnRelay(`sudo wg set wg0 peer ${peerPublicKey} remove`);
}

export type OpenvpnPeer = {
  username: string;
  password: string;
  clientIp: string; // e.g. "10.67.0.5"
  endpoint: string; // "host:port"
};

/**
 * Provisions a new OpenVPN client identity on the relay: a fixed internal
 * IP (via client-config-dir ifconfig-push, so the relay can address the
 * router deterministically the same way it does for WireGuard peers) and a
 * username/password pair, since the relay's OpenVPN server is configured
 * with client-cert-not-required + username-as-common-name (RouterOS's
 * ovpn-client only needs connect-to/user/password, no certificate import).
 */
export async function allocateOpenvpnPeer(name: string): Promise<OpenvpnPeer> {
  // Allows '@' and '.' (in addition to the usual safe charset) so a peer can
  // use a cosmetic, email-style identifier (e.g. "korhogo42@safelinkhub.id")
  // as its real OpenVPN username — it's just a string both RouterOS and the
  // relay's checkpsw.sh treat as an opaque login, not an actual DNS lookup.
  const safeName = name.replace(/[^a-zA-Z0-9@._-]/g, "-").slice(0, 64) || "router";
  const publicHost = getRelayPublicHost();
  const output = await runOnRelay(`sudo bash -s -- ${shellArg(safeName)} ${shellArg(publicHost)} <<'SCRIPT'
set -euo pipefail
NAME="$1"
PUBLIC_HOST="$2"
mkdir -p /etc/openvpn/ccd /etc/openvpn/users

declare -A used
for f in /etc/openvpn/ccd/*; do
  [ -e "$f" ] || continue
  ip=$(grep -oP '(?<=ifconfig-push )[0-9.]+' "$f" || true)
  octet="\${ip##*.}"
  if [[ "$octet" =~ ^[0-9]+$ ]]; then
    used[$octet]=1
  fi
done

NEXT_OCTET=""
for octet in $(seq 2 254); do
  if [[ -z "\${used[$octet]+x}" ]]; then
    NEXT_OCTET="$octet"
    break
  fi
done
if [[ -z "$NEXT_OCTET" ]]; then
  echo "No available OpenVPN client address" >&2
  exit 1
fi

CLIENT_IP="10.67.0.\${NEXT_OCTET}"
PASSWORD=$(openssl rand -base64 18 | tr -dc 'a-zA-Z0-9')
SERVER_HOST="\${PUBLIC_HOST:-$(curl -fsS https://checkip.amazonaws.com)}"

echo "ifconfig-push \${CLIENT_IP} 255.255.255.0" > /etc/openvpn/ccd/"\${NAME}"
echo -n "\${PASSWORD}" > /etc/openvpn/users/"\${NAME}".pass
chmod 600 /etc/openvpn/users/"\${NAME}".pass

echo "Username = \${NAME}"
echo "Password = \${PASSWORD}"
echo "ClientIp = \${CLIENT_IP}"
echo "Endpoint = \${SERVER_HOST}:1194"
SCRIPT`);

  const get = (key: string) => {
    const match = output.match(new RegExp(`^${key}\\s*=\\s*(.+)$`, "m"));
    if (!match) throw new Error(`Relay output missing ${key}`);
    return match[1].trim();
  };

  return {
    username: get("Username"),
    password: get("Password"),
    clientIp: get("ClientIp"),
    endpoint: get("Endpoint"),
  };
}

export async function revokeOpenvpnPeer(username: string): Promise<void> {
  const safeName = username.replace(/[^a-zA-Z0-9@._-]/g, "-").slice(0, 64);
  if (!safeName) return;
  await runOnRelay(
    `sudo rm -f /etc/openvpn/ccd/${safeName} /etc/openvpn/users/${safeName}.pass`,
  );
}

/** Reads the relay's OpenVPN CA certificate, needed to build a full .ovpn client file. */
export async function getOpenvpnCaCertificate(): Promise<string> {
  return runOnRelay("sudo cat /etc/openvpn/server/ca.crt");
}

export type RelayTunnel = {
  stream: import("stream").Duplex;
  close: () => void;
};

/**
 * Opens an SSH connection to the EC2 relay and asks it to forward a TCP
 * connection to <tunnelIp>:<port> on its side (the relay sits on the
 * WireGuard subnet, so it can reach the router's tunnel IP directly).
 * The returned stream behaves like a regular socket for protocol purposes.
 */
export function openRouterTunnel(
  tunnelIp: string,
  port: number,
  timeoutMs = 8000,
): Promise<RelayTunnel> {
  const host = process.env.WG_RELAY_HOST;
  const username = process.env.WG_RELAY_SSH_USER;
  if (!host || !username) {
    throw new Error("WG_RELAY_HOST / WG_RELAY_SSH_USER are not set");
  }

  const t0 = Date.now();
  const log = (msg: string) => console.log(`[relay tunnel +${Date.now() - t0}ms] ${msg}`);

  return new Promise((resolve, reject) => {
    const conn = new Client();
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      log("TIMEOUT before tunnel established");
      conn.end();
      reject(new Error("Routeur inaccessible — tunnel VPN inactif ou routeur hors ligne"));
    }, timeoutMs);

    log(`connecting to relay ${host} as ${username}`);

    conn
      .on("ready", () => {
        log("SSH connection ready, requesting forwardOut");
        conn.forwardOut("127.0.0.1", 0, tunnelIp, port, (err, stream) => {
          if (settled) return;
          if (err) {
            settled = true;
            clearTimeout(timer);
            log(`forwardOut failed: ${err.message}`);
            conn.end();
            return reject(err);
          }
          settled = true;
          clearTimeout(timer);
          log("forwardOut established");
          stream.on("close", () => conn.end());
          resolve({
            stream,
            close: () => conn.end(),
          });
        });
      })
      .on("error", (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        log(`SSH connection error: ${err.message}`);
        reject(err);
      })
      .connect({
        host,
        username,
        privateKey: getRelayPrivateKey(),
        readyTimeout: timeoutMs,
      });
  });
}

/**
 * Same as openRouterTunnel, but retries a couple of times with a short
 * delay. Right after the install script runs, the router's WireGuard
 * handshake / route to the relay can take a few seconds to come up, so the
 * very first tunnel attempt commonly times out even though the peer is
 * about to become reachable.
 */
export async function openRouterTunnelWithRetry(
  tunnelIp: string,
  port: number,
  timeoutMs = 20000,
  attempts = 3,
  delayMs = 4000,
): Promise<RelayTunnel> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await openRouterTunnel(tunnelIp, port, timeoutMs);
    } catch (err) {
      lastErr = err;
      if (attempt < attempts) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Routeur inaccessible après plusieurs tentatives");
}

/**
 * Opens a public TCP port on the relay that DNATs straight through to a
 * router's tunnel IP:port — the "no VPN client needed" path. Anyone who
 * knows relay_ip:publicPort can point WinBox (or a browser, for WebFig)
 * directly at it, same as a classic NAT port-forward on a home router.
 * Needs both a PREROUTING DNAT rule (so the relay rewrites the destination)
 * and a POSTROUTING MASQUERADE rule scoped to that destination (so the
 * router's reply goes back through the relay instead of out its own WAN —
 * without this the router would try to answer the original public client
 * IP directly, which it can't reach).
 */
export async function allocatePortForward(
  tunnelIp: string,
  targetPort: number,
  shard?: string | null,
): Promise<{ publicPort: number }> {
  // Sharded routers draw their public port from their shard's disjoint range
  // (e.g. s2 → 39000–47999); everything else uses the legacy 30000–30999 pool.
  const [rangeStart, rangeEnd] = portRangeForShard(shard);
  const output = await runOnRelay(`sudo bash -s -- ${tunnelIp} ${targetPort} ${rangeStart} ${rangeEnd} <<'SCRIPT'
set -euo pipefail
TUNNEL_IP="$1"
TARGET_PORT="$2"
RANGE_START="$3"
RANGE_END="$4"

USED=$(iptables -t nat -L PREROUTING -n | grep -oP 'dpt:\\K[0-9]+' || true)
PORT=""
for candidate in $(seq "$RANGE_START" "$RANGE_END"); do
  if ! grep -qx "$candidate" <<< "$USED"; then
    PORT="$candidate"
    break
  fi
done
if [[ -z "$PORT" ]]; then
  echo "No available forward port" >&2
  exit 1
fi

iptables -t nat -A PREROUTING -p tcp --dport "$PORT" -j DNAT --to-destination "\${TUNNEL_IP}:\${TARGET_PORT}"
iptables -t nat -A POSTROUTING -d "$TUNNEL_IP" -p tcp --dport "$TARGET_PORT" -j MASQUERADE
iptables -A FORWARD -p tcp -d "$TUNNEL_IP" --dport "$TARGET_PORT" -j ACCEPT
command -v netfilter-persistent >/dev/null 2>&1 && netfilter-persistent save >/dev/null 2>&1 || true

echo "Port = \${PORT}"
SCRIPT`);

  const match = output.match(/^Port\s*=\s*(\d+)$/m);
  if (!match) throw new Error("Relay output missing Port");
  return { publicPort: Number(match[1]) };
}

export async function revokePortForward(
  tunnelIp: string,
  targetPort: number,
  publicPort: number,
): Promise<void> {
  await runOnRelay(`sudo bash -s -- ${tunnelIp} ${targetPort} ${publicPort} <<'SCRIPT'
set -euo pipefail
TUNNEL_IP="$1"
TARGET_PORT="$2"
PUBLIC_PORT="$3"

while iptables -t nat -C PREROUTING -p tcp --dport "$PUBLIC_PORT" -j DNAT --to-destination "$TUNNEL_IP:$TARGET_PORT" 2>/dev/null; do
  iptables -t nat -D PREROUTING -p tcp --dport "$PUBLIC_PORT" -j DNAT --to-destination "$TUNNEL_IP:$TARGET_PORT"
done

while iptables -t nat -C POSTROUTING -d "$TUNNEL_IP" -p tcp --dport "$TARGET_PORT" -j MASQUERADE 2>/dev/null; do
  iptables -t nat -D POSTROUTING -d "$TUNNEL_IP" -p tcp --dport "$TARGET_PORT" -j MASQUERADE
done

while iptables -C FORWARD -p tcp -d "$TUNNEL_IP" --dport "$TARGET_PORT" -j ACCEPT 2>/dev/null; do
  iptables -D FORWARD -p tcp -d "$TUNNEL_IP" --dport "$TARGET_PORT" -j ACCEPT
done

command -v netfilter-persistent >/dev/null 2>&1 && netfilter-persistent save >/dev/null 2>&1 || true
SCRIPT`);
}

/**
 * "Bypass IPv6" exit-node NAT: makes the relay masquerade all traffic coming
 * from a router's tunnel IP out its own WAN interface, so the router's hotspot
 * clients reach the Internet with the relay's public IPv4 (the point of the
 * feature, for FAI IPv6/CGNAT/DS-Lite). The router src-nats client packets to
 * its tunnel IP before sending them into the tunnel (so wg0's cryptokey-routing
 * accepts src=10.66.0.X), and this rule then rewrites that to the relay's WAN
 * IP. Idempotent (iptables -C guards) and scoped to a single tunnel IP so it
 * can be toggled per router without touching other peers' rules.
 */
export async function enableExitNat(tunnelIp: string): Promise<void> {
  await runOnRelay(`sudo bash -s -- ${shellArg(tunnelIp)} <<'SCRIPT'
set -euo pipefail
TUNNEL_IP="$1"
WAN=$(ip route show default | awk '{print $5; exit}')
if [[ -z "$WAN" ]]; then
  echo "Could not determine WAN egress interface" >&2
  exit 1
fi

sysctl -w net.ipv4.ip_forward=1 >/dev/null 2>&1 || true

iptables -t nat -C POSTROUTING -s "\${TUNNEL_IP}/32" -o "$WAN" -j MASQUERADE 2>/dev/null || \
  iptables -t nat -A POSTROUTING -s "\${TUNNEL_IP}/32" -o "$WAN" -j MASQUERADE
iptables -C FORWARD -s "\${TUNNEL_IP}/32" -j ACCEPT 2>/dev/null || \
  iptables -A FORWARD -s "\${TUNNEL_IP}/32" -j ACCEPT
iptables -C FORWARD -d "\${TUNNEL_IP}/32" -m state --state ESTABLISHED,RELATED -j ACCEPT 2>/dev/null || \
  iptables -A FORWARD -d "\${TUNNEL_IP}/32" -m state --state ESTABLISHED,RELATED -j ACCEPT

command -v netfilter-persistent >/dev/null 2>&1 && netfilter-persistent save >/dev/null 2>&1 || true
SCRIPT`);
}

/** Tears down the exit-node NAT rules for a tunnel IP (see enableExitNat). */
export async function disableExitNat(tunnelIp: string): Promise<void> {
  await runOnRelay(`sudo bash -s -- ${shellArg(tunnelIp)} <<'SCRIPT'
set -euo pipefail
TUNNEL_IP="$1"
WAN=$(ip route show default | awk '{print $5; exit}')

# The MASQUERADE rule is scoped to the WAN interface it was added with, so
# only remove it when that interface is known; the two FORWARD rules aren't.
if [[ -n "$WAN" ]]; then
  while iptables -t nat -C POSTROUTING -s "\${TUNNEL_IP}/32" -o "$WAN" -j MASQUERADE 2>/dev/null; do
    iptables -t nat -D POSTROUTING -s "\${TUNNEL_IP}/32" -o "$WAN" -j MASQUERADE
  done
fi

while iptables -C FORWARD -s "\${TUNNEL_IP}/32" -j ACCEPT 2>/dev/null; do
  iptables -D FORWARD -s "\${TUNNEL_IP}/32" -j ACCEPT
done

while iptables -C FORWARD -d "\${TUNNEL_IP}/32" -m state --state ESTABLISHED,RELATED -j ACCEPT 2>/dev/null; do
  iptables -D FORWARD -d "\${TUNNEL_IP}/32" -m state --state ESTABLISHED,RELATED -j ACCEPT
done

command -v netfilter-persistent >/dev/null 2>&1 && netfilter-persistent save >/dev/null 2>&1 || true
SCRIPT`);
}
