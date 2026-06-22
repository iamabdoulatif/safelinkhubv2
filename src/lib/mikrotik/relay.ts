import { Client } from "ssh2";

function getRelayPrivateKey(): string {
  const b64 = process.env.WG_RELAY_SSH_KEY_B64;
  if (!b64) throw new Error("WG_RELAY_SSH_KEY_B64 is not set");
  return Buffer.from(b64, "base64").toString("utf8");
}

function runOnRelay(command: string, timeoutMs = 15000): Promise<string> {
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
  const output = await runOnRelay(`sudo bash -s -- ${safeName} <<'SCRIPT'
set -euo pipefail
NAME="$1"
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
SERVER_IP=$(curl -fsS https://checkip.amazonaws.com)

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
echo "Endpoint = \${SERVER_IP}:51820"
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
  const safeName = name.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 40) || "router";
  const output = await runOnRelay(`sudo bash -s -- ${safeName} <<'SCRIPT'
set -euo pipefail
NAME="$1"
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
SERVER_IP=$(curl -fsS https://checkip.amazonaws.com)

echo "ifconfig-push \${CLIENT_IP} 255.255.255.0" > /etc/openvpn/ccd/"\${NAME}"
echo -n "\${PASSWORD}" > /etc/openvpn/users/"\${NAME}".pass
chmod 600 /etc/openvpn/users/"\${NAME}".pass

echo "Username = \${NAME}"
echo "Password = \${PASSWORD}"
echo "ClientIp = \${CLIENT_IP}"
echo "Endpoint = \${SERVER_IP}:1194"
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
  const safeName = username.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 40);
  if (!safeName) return;
  await runOnRelay(
    `sudo rm -f /etc/openvpn/ccd/${safeName} /etc/openvpn/users/${safeName}.pass`,
  );
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
      reject(new Error("SSH tunnel setup timed out"));
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
  throw lastErr instanceof Error ? lastErr : new Error("SSH tunnel setup failed");
}
