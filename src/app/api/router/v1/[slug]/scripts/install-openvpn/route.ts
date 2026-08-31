import { NextRequest } from "next/server";
import { eq, and } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { routers, organizations, routerReplacements } from "@/lib/db/schema";
import { decryptSecret } from "@/lib/mikrotik/crypto";
import { allocateOpenvpnPeer } from "@/lib/mikrotik/relay";
import { hashToken } from "@/lib/mikrotik/install-token";
import { buildOpenvpnInstallScript } from "@/lib/mikrotik/openvpn-install-script";

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
        eq(routers.status, "pending"),
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

  const [replacement] = await db
    .select({ id: routerReplacements.id })
    .from(routerReplacements)
    .where(eq(routerReplacements.replacementRouterId, router.id))
    .limit(1);

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
  if (replacement) {
    await db
      .update(routerReplacements)
      .set({ status: "installing", error: null })
      .where(eq(routerReplacements.id, replacement.id));
  }

  const callbackUrl = new URL(
    `/api/router/v1/${org.slug}/scripts/install-openvpn/installed`,
    request.nextUrl.origin,
  ).toString();
  const script = buildOpenvpnInstallScript({
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
