"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { routerPortForwards, routers } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import { allocatePortForward, revokePortForward } from "./relay";

/**
 * "No VPN client needed" remote access: a public relay_ip:port that DNATs
 * straight to a connected router's WinBox (8291) or WebFig (80) port, so
 * any device — phone or PC, no app install, no VPN config — can just point
 * WinBox or a browser at it directly. Trade-off: that port is then
 * reachable by anyone who finds it, protected only by the router's own
 * login, same exposure model as giving the router a public IP.
 */

const SERVICE_PORTS: Record<string, number> = {
  winbox: 8291,
  // 80 stays free for the hotspot captive portal — provisionHotspotStack
  // moves WebFig (the "www" service) to 85 specifically so the two don't
  // collide, so the relay must target 85 too or every forwarded WebFig
  // connection hits the hotspot login page instead of RouterOS WebFig.
  webfig: 85,
  ssh: 22,
};

export async function listPortForwards(routerId: string) {
  const session = await getSession();
  if (!session) return [];

  const db = getDb();
  const [router] = await db
    .select({ orgId: routers.orgId })
    .from(routers)
    .where(eq(routers.id, routerId))
    .limit(1);
  if (!router || router.orgId !== session.orgId) return [];

  return db
    .select()
    .from(routerPortForwards)
    .where(eq(routerPortForwards.routerId, routerId));
}

export async function enablePortForward(routerId: string, service: string) {
  const session = await getSession();
  if (!session) return { error: "Not authenticated." };

  const targetPort = SERVICE_PORTS[service];
  if (!targetPort) return { error: "Unknown service." };

  const db = getDb();
  const [router] = await db
    .select()
    .from(routers)
    .where(eq(routers.id, routerId))
    .limit(1);
  if (!router || router.orgId !== session.orgId) {
    return { error: "Router not found." };
  }
  if (!router.tunnelIp || router.connectionMethod === "direct") {
    return {
      error: "Le routeur doit être connecté via WireGuard ou OpenVPN pour activer l'accès direct.",
    };
  }

  let publicPort: number;
  try {
    const result = await allocatePortForward(router.tunnelIp, targetPort);
    publicPort = result.publicPort;
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? `Could not allocate port forward: ${err.message}`
          : "Could not allocate port forward.",
    };
  }

  await db.insert(routerPortForwards).values({
    routerId,
    service,
    targetPort,
    publicPort,
    tunnelIp: router.tunnelIp,
    status: "active",
  });

  revalidatePath("/admin/remote-access");
  revalidatePath("/admin/router");
  return { success: true, publicPort, relayHost: process.env.WG_RELAY_HOST };
}

export async function disablePortForward(forwardId: string) {
  const session = await getSession();
  if (!session) return { error: "Not authenticated." };

  const db = getDb();
  const [forward] = await db
    .select()
    .from(routerPortForwards)
    .where(eq(routerPortForwards.id, forwardId))
    .limit(1);
  if (!forward) return { error: "Forward not found." };

  const [router] = await db
    .select({ orgId: routers.orgId })
    .from(routers)
    .where(eq(routers.id, forward.routerId))
    .limit(1);
  if (!router || router.orgId !== session.orgId) {
    return { error: "Forward not found." };
  }

  try {
    await revokePortForward(forward.tunnelIp, forward.targetPort, forward.publicPort);
  } catch (err) {
    return {
      error: err instanceof Error ? `Could not revoke: ${err.message}` : "Could not revoke.",
    };
  }

  await db.delete(routerPortForwards).where(eq(routerPortForwards.id, forwardId));

  revalidatePath("/admin/remote-access");
  revalidatePath("/admin/router");
  return { success: true };
}
