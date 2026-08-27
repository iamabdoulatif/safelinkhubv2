import { Client } from "ssh2";
import { shardingEnabled, isShard } from "./shards";

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

/**
 * URL d'une redirection WEB servie par le relais.
 *
 * EN HTTPS, TOUJOURS. Le générateur de vhosts écrit `listen <port> ssl` et
 * présente le certificat joker : les 55 vhosts du relais, sans exception, ne
 * parlent que TLS. Une URL en `http://` sur ces ports reçoit un 400 de nginx
 * (« The plain HTTP request was sent to HTTPS port ») — mesuré sur un routeur
 * dont MikHmon tournait : 400 en http, 302 en https.
 *
 * Le port n'a rien de standard, donc le schéma ne se devine pas : il doit être
 * écrit ici, une seule fois, plutôt que recomposé à la main par chaque écran.
 */
export function relayWebUrl(shard: string | null | undefined, publicPort: number): string {
  return `https://${getRelayPublicHost(shard)}:${publicPort}`;
}

function shellArg(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

/**
 * RouterOS sends a WireGuard keepalive every 25 seconds.  Allow several
 * packets of jitter before treating its most recent handshake as stale so a
 * loaded relay cannot briefly turn a healthy tunnel into an "offline" UI
 * state.
 */
export const WIREGUARD_HANDSHAKE_FRESH_MS = 2 * 60 * 1000;

export function hasFreshWireGuardHandshake(
  latestHandshakeAtMs: number | null,
  nowMs = Date.now(),
): boolean {
  return (
    latestHandshakeAtMs !== null &&
    latestHandshakeAtMs <= nowMs &&
    nowMs - latestHandshakeAtMs <= WIREGUARD_HANDSHAKE_FRESH_MS
  );
}

/**
 * Reads the relay's transport-level observation for a WireGuard peer.  This
 * is independent from RouterOS' API: it remains useful when the router is
 * busy answering hotspot requests and an API stats refresh times out.
 */
export async function getWireGuardPeerLatestHandshake(
  peerPublicKey: string,
): Promise<number | null> {
  if (!/^[A-Za-z0-9+/]{43}=$/.test(peerPublicKey)) {
    throw new Error("Invalid WireGuard peer public key");
  }

  const output = await runOnRelay(
    `sudo wg show wg0 latest-handshakes | awk -v peer=${shellArg(peerPublicKey)} '$1 == peer { print $2 }'`,
    8000,
  );
  const seconds = Number(output.trim());
  return Number.isSafeInteger(seconds) && seconds > 0 ? seconds * 1000 : null;
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

wg set wg0 peer "$PEER_PUB" allowed-ips "$PEER_IP" persistent-keepalive 25
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
        // Écart CROISSANT et bruité, pas fixe. sshd du relais limite les
        // connexions non authentifiées (MaxStartups) et en jette au hasard
        // pendant la rafale : le 16/08 à 09:44, 4 connexions perdues en 4
        // secondes — soit exactement l'ancien délai fixe, donc les trois
        // essais retombaient dans la même rafale. Le bruit évite en plus que
        // toutes les opérations parallèles ne réessaient à la même seconde.
        const backoff = delayMs * attempt + Math.floor(Math.random() * delayMs);
        await new Promise((r) => setTimeout(r, backoff));
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
  // Le shard ne détermine plus la PLAGE de port (l'allocation est désormais
  // aléatoire sur une plage globale, voir plus bas) — il ne sert qu'au HÔTE
  // public (getRelayPublicHost, sN.safelinkhub.io), résolu par l'appelant.
  _shard?: string | null,
  // Browser services (WebFig/MikHmon) are TLS-terminated by nginx on the
  // public port instead of raw-DNAT'd — browsers force HTTPS and a plain DNAT
  // port only speaks HTTP. For those we don't add a DNAT; we add a no-op
  // marker rule so the public port still counts as "used" by the allocator
  // (which scans iptables), and nginx binds and terminates TLS on it.
  tlsTerminated = false,
): Promise<{ publicPort: number }> {
  // Port public TIRÉ AU HASARD sur une plage large [1500, 64000] (mélange 4 et
  // 5 chiffres), au lieu du premier libre séquentiel dans la plage du shard —
  // les ports d'accès distant sont ainsi imprévisibles et variés. On EXCLUT
  // toujours : les ports déjà pris par un forward (scan iptables) ET les ports
  // que le relais écoute lui-même (ss), pour ne jamais détourner un service du
  // relais. On reste ≥ 1500 : les ports < 1024 sont réservés/privilégiés
  // (SSH/HTTP/HTTPS…) et les détourner casserait le relais.
  const output = await runOnRelay(`sudo bash -s -- ${tunnelIp} ${targetPort} ${tlsTerminated ? 1 : 0} <<'SCRIPT'
set -euo pipefail
TUNNEL_IP="$1"
TARGET_PORT="$2"
TLS_TERMINATED="$3"

LOW=1500
HIGH=64000
USED=$(iptables -t nat -L PREROUTING -n | grep -oP 'dpt:\\K[0-9]+' || true)
LISTEN=$(ss -tlnH 2>/dev/null | awk '{n=split($4,a,":"); print a[n]}' | grep -oE '^[0-9]+$' | sort -un || true)

PORT=""
n=0
while [ "$n" -lt 400 ]; do
  n=$((n + 1))
  cand=$(( ( (RANDOM << 15) | RANDOM ) % (HIGH - LOW + 1) + LOW ))
  if grep -qx "$cand" <<< "$USED"; then continue; fi
  if grep -qx "$cand" <<< "$LISTEN"; then continue; fi
  PORT="$cand"
  break
done
if [[ -z "$PORT" ]]; then
  for cand in $(seq "$LOW" "$HIGH"); do
    if grep -qx "$cand" <<< "$USED"; then continue; fi
    if grep -qx "$cand" <<< "$LISTEN"; then continue; fi
    PORT="$cand"
    break
  done
fi
if [[ -z "$PORT" ]]; then
  echo "No available forward port" >&2
  exit 1
fi

if [[ "$TLS_TERMINATED" == "1" ]]; then
  # Reserve the port in the iptables scan; nginx (TLS) will bind and proxy it.
  iptables -t nat -A PREROUTING -p tcp --dport "$PORT" -j ACCEPT
else
  iptables -t nat -A PREROUTING -p tcp --dport "$PORT" -j DNAT --to-destination "\${TUNNEL_IP}:\${TARGET_PORT}"
  iptables -t nat -A POSTROUTING -d "$TUNNEL_IP" -p tcp --dport "$TARGET_PORT" -j MASQUERADE
  iptables -A FORWARD -p tcp -d "$TUNNEL_IP" --dport "$TARGET_PORT" -j ACCEPT
fi
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
  tlsTerminated = false,
): Promise<void> {
  await runOnRelay(`sudo bash -s -- ${tunnelIp} ${targetPort} ${publicPort} ${tlsTerminated ? 1 : 0} <<'SCRIPT'
set -euo pipefail
TUNNEL_IP="$1"
TARGET_PORT="$2"
PUBLIC_PORT="$3"
TLS_TERMINATED="$4"

# TLS-terminated (nginx) forwards only have the no-op reservation marker.
while iptables -t nat -C PREROUTING -p tcp --dport "$PUBLIC_PORT" -j ACCEPT 2>/dev/null; do
  iptables -t nat -D PREROUTING -p tcp --dport "$PUBLIC_PORT" -j ACCEPT
done

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

export type PortForwardRebindRow = {
  targetPort: number;
  publicPort: number;
  tlsTerminated: boolean;
};

/** Idempotent relay program for moving paid forwards to a new tunnel. */
export function buildPortForwardRebindScript(
  _oldTunnelIp: string,
  _newTunnelIp: string,
  _forwards: PortForwardRebindRow[],
): string {
  return [
    `# Rebind ${_oldTunnelIp || "(none)"} -> ${_newTunnelIp}; ports ${_forwards.map((forward) => forward.publicPort).join(",")}`,
    "set -euo pipefail",
    'OLD_TUNNEL_IP="$1"',
    'NEW_TUNNEL_IP="$2"',
    'ROWS="$3"',
    "while IFS=: read -r TARGET_PORT PUBLIC_PORT TLS_TERMINATED; do",
    '  if [ -z "$PUBLIC_PORT" ]; then continue; fi',
    '  if [[ "$TLS_TERMINATED" == "1" ]]; then',
    '    iptables -t nat -C PREROUTING -p tcp --dport "$PUBLIC_PORT" -j ACCEPT 2>/dev/null || iptables -t nat -A PREROUTING -p tcp --dport "$PUBLIC_PORT" -j ACCEPT',
    "    continue",
    "  fi",
    '  iptables -t nat -C PREROUTING -p tcp --dport "$PUBLIC_PORT" -j DNAT --to-destination "${NEW_TUNNEL_IP}:${TARGET_PORT}" 2>/dev/null || iptables -t nat -I PREROUTING 1 -p tcp --dport "$PUBLIC_PORT" -j DNAT --to-destination "${NEW_TUNNEL_IP}:${TARGET_PORT}"',
    '  iptables -t nat -C POSTROUTING -d "$NEW_TUNNEL_IP" -p tcp --dport "$TARGET_PORT" -j MASQUERADE 2>/dev/null || iptables -t nat -A POSTROUTING -d "$NEW_TUNNEL_IP" -p tcp --dport "$TARGET_PORT" -j MASQUERADE',
    '  iptables -C FORWARD -p tcp -d "$NEW_TUNNEL_IP" --dport "$TARGET_PORT" -j ACCEPT 2>/dev/null || iptables -A FORWARD -p tcp -d "$NEW_TUNNEL_IP" --dport "$TARGET_PORT" -j ACCEPT',
    '  if [ -n "$OLD_TUNNEL_IP" ] && [ "$OLD_TUNNEL_IP" != "$NEW_TUNNEL_IP" ]; then',
    '    while iptables -t nat -C PREROUTING -p tcp --dport "$PUBLIC_PORT" -j DNAT --to-destination "${OLD_TUNNEL_IP}:${TARGET_PORT}" 2>/dev/null; do iptables -t nat -D PREROUTING -p tcp --dport "$PUBLIC_PORT" -j DNAT --to-destination "${OLD_TUNNEL_IP}:${TARGET_PORT}"; done',
    '    while iptables -t nat -C POSTROUTING -d "$OLD_TUNNEL_IP" -p tcp --dport "$TARGET_PORT" -j MASQUERADE 2>/dev/null; do iptables -t nat -D POSTROUTING -d "$OLD_TUNNEL_IP" -p tcp --dport "$TARGET_PORT" -j MASQUERADE; done',
    '    while iptables -C FORWARD -p tcp -d "$OLD_TUNNEL_IP" --dport "$TARGET_PORT" -j ACCEPT 2>/dev/null; do iptables -D FORWARD -p tcp -d "$OLD_TUNNEL_IP" --dport "$TARGET_PORT" -j ACCEPT; done',
    "  fi",
    "done <<< \"$ROWS\"",
    'command -v netfilter-persistent >/dev/null 2>&1 && netfilter-persistent save >/dev/null 2>&1 || true',
  ].join("\n");
}

/** Rebind existing public forwards without allocating new public ports. */
export async function rebindPortForwards(
  oldTunnelIp: string | null,
  newTunnelIp: string,
  forwards: PortForwardRebindRow[],
): Promise<void> {
  if (forwards.length === 0) return;
  const rows = forwards
    .map((forward) => `${forward.targetPort}:${forward.publicPort}:${forward.tlsTerminated ? 1 : 0}`)
    .join("\n");
  await runOnRelay(`sudo bash -s -- ${shellArg(oldTunnelIp ?? "")} ${shellArg(newTunnelIp)} ${shellArg(rows)} <<'SCRIPT'
${buildPortForwardRebindScript(oldTunnelIp ?? "", newTunnelIp, forwards)}
SCRIPT`);
}

/**
 * Re-asserts the relay-side rules for a router's ALREADY-ALLOCATED forwards at
 * their exact recorded public ports — the reconnect-time counterpart to
 * allocatePortForward. allocatePortForward can't be reused for this: it scans
 * iptables and picks a *fresh* port every call, so replaying it would leak a
 * new port (and rule) each time instead of restoring the existing mapping.
 *
 * Needed because the relay's iptables state is not durable across a relay
 * reboot / container recreate / firewall flush: when it's lost, every public
 * forward silently dies even though the router's tunnel is perfectly healthy
 * and looks "online". Each rule is guarded by `iptables -C`, so this is a
 * no-op when the mapping is already present and safe to call on every
 * reconnect. `forwards` all belong to one router, hence a single tunnelIp.
 */
export async function ensureRouterPortForwards(
  tunnelIp: string,
  forwards: Array<{ targetPort: number; publicPort: number; tlsTerminated: boolean }>,
): Promise<void> {
  if (forwards.length === 0) return;
  // Rows are passed as a single positional arg (quoted), never interpolated
  // into the script body, matching the injection-safe pattern of the other
  // relay helpers. Values are integers we control, so the split on ':' is safe.
  const rows = forwards
    .map((f) => `${f.targetPort}:${f.publicPort}:${f.tlsTerminated ? 1 : 0}`)
    .join("\n");
  await runOnRelay(`sudo bash -s -- ${shellArg(tunnelIp)} ${shellArg(rows)} <<'SCRIPT'
set -euo pipefail
TUNNEL_IP="$1"
ROWS="$2"
while IFS=: read -r TARGET_PORT PUBLIC_PORT TLS_TERMINATED; do
  if [ -z "$PUBLIC_PORT" ]; then continue; fi
  if [[ "$TLS_TERMINATED" == "1" ]]; then
    iptables -t nat -C PREROUTING -p tcp --dport "$PUBLIC_PORT" -j ACCEPT 2>/dev/null || \
      iptables -t nat -A PREROUTING -p tcp --dport "$PUBLIC_PORT" -j ACCEPT
  else
    iptables -t nat -C PREROUTING -p tcp --dport "$PUBLIC_PORT" -j DNAT --to-destination "\${TUNNEL_IP}:\${TARGET_PORT}" 2>/dev/null || \
      iptables -t nat -A PREROUTING -p tcp --dport "$PUBLIC_PORT" -j DNAT --to-destination "\${TUNNEL_IP}:\${TARGET_PORT}"
    iptables -t nat -C POSTROUTING -d "$TUNNEL_IP" -p tcp --dport "$TARGET_PORT" -j MASQUERADE 2>/dev/null || \
      iptables -t nat -A POSTROUTING -d "$TUNNEL_IP" -p tcp --dport "$TARGET_PORT" -j MASQUERADE
    iptables -C FORWARD -p tcp -d "$TUNNEL_IP" --dport "$TARGET_PORT" -j ACCEPT 2>/dev/null || \
      iptables -A FORWARD -p tcp -d "$TUNNEL_IP" --dport "$TARGET_PORT" -j ACCEPT
  fi
done <<< "$ROWS"
command -v netfilter-persistent >/dev/null 2>&1 && netfilter-persistent save >/dev/null 2>&1 || true
SCRIPT`);
}

