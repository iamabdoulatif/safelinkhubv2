import { NextRequest } from "next/server";
import { eq, and, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { routers, organizations } from "@/lib/db/schema";
import { decryptSecret } from "@/lib/mikrotik/crypto";
import { allocateOpenvpnPeer } from "@/lib/mikrotik/relay";
import { hashToken } from "@/lib/mikrotik/install-token";

function escapeRosString(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function buildScript(opts: {
  connectTo: string;
  port: string;
  username: string;
  password: string;
  apiPassword: string;
  callbackUrl: string;
  callbackMode: "http" | "https";
  installToken: string;
  identityName: string;
}) {
  return `# SafeLinkHub managed OpenVPN tunnel - auto-generated, do not edit
/system identity set name="${escapeRosString(opts.identityName)}"
/interface/ovpn-client/remove [find name=safelinkhub-ovpn]
/interface ovpn-client add name=safelinkhub-ovpn connect-to=${opts.connectTo} port=${opts.port} protocol=udp cipher=aes256-gcm user="${opts.username}" password="${opts.password}" mode=ip add-default-route=no disabled=no

/user remove [find name=safelinkhub-api]
/user group remove [find name=safelinkhub-group]
/user group add name=safelinkhub-group policy=api,read,write,test,sensitive
/user add name=safelinkhub-api password="${opts.apiPassword}" group=safelinkhub-group


# Scoped to the tunnel subnet plus the Docker subnet — MikHmon runs inside
# the container at 11.11.11.11 and connects to the router's own API at the
# DOCKER-SAFELINKHUB bridge gateway (11.11.11.1) to manage hotspot users/vouchers.
# Restricting to the tunnel subnet alone silently rejects that connection
# and MikHmon's session settings show "MikroTik Not Connected" even with
# correct IP/credentials — see provisionHotspotStack's matching allowlist.
/ip service set api address=10.67.0.0/24,11.11.11.0/28
/ip service enable api
:log info "SafeLinkHub OpenVPN tunnel installed successfully"

:delay 5s
:do {
  /tool fetch url="${opts.callbackUrl}" http-header-field="Authorization: Bearer ${opts.installToken}" mode=${opts.callbackMode} output=none
  :log info "SafeLinkHub server notified that OpenVPN tunnel installation completed"
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
    peer = await allocateOpenvpnPeer(`${org.slug}-${router.name}`);
  } catch (err) {
    return new Response(
      `Could not allocate OpenVPN tunnel: ${err instanceof Error ? err.message : "unknown error"}`,
      { status: 502 },
    );
  }

  const apiPassword = decryptSecret(router.passwordEncrypted);
  const [connectTo, port] = peer.endpoint.split(":");

  await db
    .update(routers)
    .set({
      host: peer.clientIp,
      tunnelIp: peer.clientIp,
      connectionMethod: "openvpn",
      status: "installing",
    })
    .where(eq(routers.id, router.id));

  const callbackUrl = new URL(
    `/api/router/v1/${org.slug}/scripts/install-openvpn/installed`,
    request.nextUrl.origin,
  ).toString();
  const script = buildScript({
    connectTo,
    port,
    username: peer.username,
    password: peer.password,
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
