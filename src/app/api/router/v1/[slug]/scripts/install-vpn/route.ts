import { NextRequest } from "next/server";
import { eq, and, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { routers, organizations } from "@/lib/db/schema";
import { decryptSecret } from "@/lib/mikrotik/crypto";
import { allocateVpnPeer } from "@/lib/mikrotik/relay";
import { hashToken } from "@/lib/mikrotik/install-token";

const PEER_LISTEN_PORT = 51821;

function escapeRosString(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function buildScript(opts: {
  peerPrivateKey: string;
  peerAddress: string;
  serverPublicKey: string;
  endpoint: string;
  apiPassword: string;
  callbackUrl: string;
  callbackMode: "http" | "https";
  installToken: string;
  identityName: string;
}) {
  const [endpointHost, endpointPort] = opts.endpoint.split(":");

  return `# SafeLinkHub managed VPN tunnel - auto-generated, do not edit
/system identity set name="${escapeRosString(opts.identityName)}"
/interface/wireguard/remove [find name=safelinkhub-wg0]
/interface wireguard add name=safelinkhub-wg0 private-key="${opts.peerPrivateKey}" listen-port=${PEER_LISTEN_PORT}
/interface wireguard peers remove [find interface=safelinkhub-wg0]
/interface wireguard peers add interface=safelinkhub-wg0 public-key="${opts.serverPublicKey}" endpoint-address=${endpointHost} endpoint-port=${endpointPort} allowed-address=10.66.0.0/24 persistent-keepalive=25s
/ip address remove [find interface=safelinkhub-wg0]
/ip address add address=${opts.peerAddress} interface=safelinkhub-wg0

# Prepare the MikHmon container network early so the topology and later
# auto-setup both see the same DOCKERS bridge, MIKHMON veth and gateway.
# The veth commands live inside a [:parse]-ed string, NOT inline: on a
# board without the container package (fresh RB4011, mipsbe, ...) the
# /interface/veth menu doesn't exist, and an inline command would fail at
# PARSE time — aborting the whole /import with "expected end of command",
# which :do on-error cannot catch. A runtime :parse failure is catchable,
# so those boards just log the warning and continue installing the VPN.
:do {
  :foreach oldBridge in={"CONTAINERS";"dockers";"DOCKER-SAFELINKHUB";"DOCKER"} do={
    /ip address remove [find interface=$oldBridge address=11.11.11.1/28]
    :if (([:len [/interface bridge find where name=$oldBridge]] > 0) && ([:len [/interface bridge port find where bridge=$oldBridge]] = 0)) do={ /interface bridge remove [find name=$oldBridge] }
  }
  :if ([:len [/interface bridge find where name="DOCKERS"]] = 0) do={ /interface bridge add name=DOCKERS }
  :local vethPrep [:parse ":if ([:len [/interface veth find where name=\\"MIKHMON\\"]] = 0) do={ /interface veth add name=MIKHMON address=11.11.11.11/28 gateway=11.11.11.1 } else={ /interface veth set [find where name=\\"MIKHMON\\"] address=11.11.11.11/28 gateway=11.11.11.1 }; :if ([:len [/interface bridge port find where interface=\\"MIKHMON\\"]] = 0) do={ /interface bridge port add bridge=DOCKERS interface=MIKHMON } else={ /interface bridge port set [find where interface=\\"MIKHMON\\"] bridge=DOCKERS }"]
  $vethPrep
  /ip address remove [find interface=DOCKERS address=11.11.11.1/28]
  /ip address add address=11.11.11.1/28 interface=DOCKERS network=11.11.11.0
} on-error={ :log warning "SafeLinkHub could not prepare DOCKERS/MIKHMON during VPN install (container package likely missing); auto-setup will retry" }

# Format a plugged-in USB stick to ext4 early too, same as the container
# step does later — MikroTik's documented Container prerequisite, without
# which /container/config's tmpdir=usb1/pull silently fails to pull/extract
# images. Only formats when the slot is present and not already ext4, so
# re-running this script never wipes a stick that already has data on it.
:do {
  :if ([:len [/disk find where slot="usb1" and file-system!="ext4"]] > 0) do={
    /disk format-drive slot=usb1 file-system=ext4
  }
} on-error={ :log warning "SafeLinkHub could not format USB stick during VPN install; auto-setup will retry" }

# Container engine storage, auto-detected per board instead of hardcoded —
# boards differ in what storage they actually have:
#   - USB-equipped boards (hAP ax3, Chateau PRO ax, L009…) pull/extract on
#     the stick just formatted above, to spare onboard flash.
#   - USB-less boards with their own internal disk slot (RB4011 series:
#     "disk1", "disk2", … — matched by name pattern, not hardcoded) use
#     that slot.
#   - Boards with a large internal flash but no listed disk slot (RB3011,
#     RB5009…, detected via total-hdd-space) use a plain Files directory —
#     never tmpfs on these, the image must survive reboots.
#   - Everything else (ax2 / hAP ax lite: ~16MB flash) falls back to a
#     tmpfs scratch slot created here if it doesn't exist yet.
# /container/config/set goes through [:parse] for the same reason as the
# veth block above — without the container package the /container menu
# doesn't exist and an inline command would kill the whole import at
# parse time instead of being caught by on-error.
:do {
  :local tmpDir "tmp/pull"
  :local layerDir "tmp/mikhmon-layers"
  :if ([:len [/disk find where slot="usb1" and file-system="ext4"]] > 0) do={
    :set tmpDir "usb1/pull"
    :set layerDir "usb1/mikhmon-layers"
  } else={
    :local internalDisks [/disk find where slot~"^disk"]
    :if ([:len $internalDisks] > 0) do={
      :local diskSlot [/disk get [:pick $internalDisks 0] slot]
      :set tmpDir ($diskSlot . "/pull")
      :set layerDir ($diskSlot . "/mikhmon-layers")
    } else={
      :if ([/system resource get total-hdd-space] > 100000000) do={
        :set tmpDir "pull"
        :set layerDir "mikhmon-layers"
      } else={
        :if ([:len [/disk find where slot="tmp"]] = 0) do={
          /disk add slot=tmp type=tmpfs tmpfs-max-size=150000000
        }
      }
    }
  }
  :local containerCfg [:parse "/container/config/set registry-url=https://registry-1.docker.io tmpdir=$tmpDir layer-dir=$layerDir"]
  $containerCfg
} on-error={ :log warning "SafeLinkHub could not configure container storage during VPN install (container package likely missing); auto-setup will retry" }

# A /32 interface address has no implicit subnet route, so without this the
# router can decrypt inbound tunnel packets but has no route to send replies
# back to the relay (or reach any other peer on the tunnel subnet).
/ip route remove [find dst-address=10.66.0.0/24 gateway=safelinkhub-wg0]
/ip route add dst-address=10.66.0.0/24 gateway=safelinkhub-wg0

/user remove [find name=safelinkhub-api]
/user group remove [find name=safelinkhub-group]
/user group add name=safelinkhub-group policy=api,read,write,test,sensitive,ssh,ftp
/user add name=safelinkhub-api password="${opts.apiPassword}" group=safelinkhub-group


# Scoped to the tunnel subnet plus the Docker subnet — MikHmon runs inside
# the container at 11.11.11.11 and connects to the router's own API at the
# DOCKERS bridge gateway (11.11.11.1) to manage hotspot users/vouchers.
# Restricting to the tunnel subnet alone silently rejects that connection
# and MikHmon's session settings show "MikroTik Not Connected" even with
# correct IP/credentials — see provisionHotspotStack's matching allowlist.
/ip service set api address=10.66.0.0/24,11.11.11.0/28
/ip service enable api
:log info "SafeLinkHub VPN tunnel installed successfully"

:delay 2s
:do {
  /tool fetch url="${opts.callbackUrl}" http-header-field="Authorization: Bearer ${opts.installToken}" mode=${opts.callbackMode} output=none
  :log info "SafeLinkHub server notified that VPN tunnel installation completed"
} on-error={ :log warning "SafeLinkHub server install completion notification failed" }

:log info "SafeLinkHub rebooting router to finalize installation"
:delay 3s
/system reboot
`;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return new Response("Missing bearer token", { status: 401 });
  }

  const db = getDb();
  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.slug, slug))
    .limit(1);
  if (!org) {
    return new Response("Unknown organization", { status: 404 });
  }

  const tokenHash = hashToken(token);
  const [router] = await db
    .select()
    .from(routers)
    .where(
      and(
        eq(routers.orgId, org.id),
        eq(routers.installTokenHash, tokenHash),
        inArray(routers.status, ["pending", "installing"]),
      ),
    )
    .limit(1);

  if (!router) {
    return new Response("Invalid or already-used install token", { status: 403 });
  }
  if (!router.installTokenExpiresAt || router.installTokenExpiresAt < new Date()) {
    return new Response("Install token has expired", { status: 403 });
  }
  if (!router.passwordEncrypted) {
    return new Response("Router is missing API credentials", { status: 500 });
  }

  let peer;
  try {
    peer = await allocateVpnPeer(`${org.slug}-${router.name}`);
  } catch (err) {
    return new Response(
      `Could not allocate VPN tunnel: ${err instanceof Error ? err.message : "unknown error"}`,
      { status: 502 },
    );
  }

  const apiPassword = decryptSecret(router.passwordEncrypted);
  const tunnelIp = peer.peerAddress.split("/")[0];

  await db
    .update(routers)
    .set({
      host: tunnelIp,
      tunnelIp,
      wgPeerPublicKey: peer.peerPublicKey,
      connectionMethod: "vpn",
      status: "installing",
    })
    .where(eq(routers.id, router.id));

  const callbackUrl = new URL(
    `/api/router/v1/${org.slug}/scripts/install-vpn/installed`,
    request.nextUrl.origin,
  ).toString();
  const script = buildScript({
    peerPrivateKey: peer.peerPrivateKey,
    peerAddress: peer.peerAddress,
    serverPublicKey: peer.serverPublicKey,
    endpoint: peer.endpoint,
    apiPassword,
    callbackUrl,
    callbackMode: callbackUrl.startsWith("https://") ? "https" : "http",
    installToken: token,
    identityName: router.name,
  });

  return new Response(script, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
