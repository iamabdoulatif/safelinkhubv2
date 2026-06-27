"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { routerPortForwards, routers } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import { allocatePortForward, revokePortForward } from "./relay";
import { connectToRouter } from "./router-sync";
import type { RouterOSClient } from "./client";
import {
  getMikhmonTunnelNatCommands,
  getPortForwardTargetPort,
} from "./port-forward-rules";

/**
 * "No VPN client needed" remote access: a public relay_ip:port that DNATs
 * straight to a connected router's WinBox (8291) or WebFig (80) port, so
 * any device — phone or PC, no app install, no VPN config — can just point
 * WinBox or a browser at it directly. Trade-off: that port is then
 * reachable by anyone who finds it, protected only by the router's own
 * login, same exposure model as giving the router a public IP.
 */

async function ensureMikhmonTunnelNat(client: RouterOSClient) {
  const commands = getMikhmonTunnelNatCommands();
  const existing = await client.talk(commands.findExisting);
  if (existing.length > 0) return;
  await client.talk(commands.add);
}

// provisionHotspotStack's hardening step disables RouterOS's own ssh
// service (/ip/service set ssh disabled=yes) — without re-enabling it here,
// toggling on the "ssh" relay forward just opens a public port to nothing,
// and tools like FileZilla (SFTP) get connection-refused even though the
// forward itself looks "Public" in the UI.
async function setSshServiceEnabled(client: RouterOSClient, enabled: boolean) {
  await client.talk(["/ip/service/set", "=numbers=ssh", `=disabled=${enabled ? "no" : "yes"}`]);
}

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

/**
 * Core logic shared by the authenticated server action below and the
 * unauthenticated post-install bootstrap (installVpn callback runs before
 * any user session exists, triggered by the router itself via bearer
 * token) — no getSession() here, callers are responsible for authorizing
 * the request through whatever channel they came from.
 */
export type BillingPeriod = "monthly" | "quarterly" | "semiannual" | "yearly";

// Not exported: a "use server" file may only export async functions (and
// types, which are erased) — a plain object export here breaks the build
// ("A 'use server' file can only export async functions, found object").
const BILLING_PERIOD_MONTHS: Record<BillingPeriod, number> = {
  monthly: 1,
  quarterly: 3,
  semiannual: 6,
  yearly: 12,
};

function expiresAtFor(period: BillingPeriod, from = new Date()): Date {
  const date = new Date(from);
  date.setMonth(date.getMonth() + BILLING_PERIOD_MONTHS[period]);
  return date;
}

async function enablePortForwardForRouter(
  routerId: string,
  service: string,
  billingPeriod: BillingPeriod = "monthly",
) {
  const targetPort = getPortForwardTargetPort(service);
  if (!targetPort) return { error: "Unknown service." };

  const db = getDb();
  const [router] = await db
    .select()
    .from(routers)
    .where(eq(routers.id, routerId))
    .limit(1);
  if (!router) {
    return { error: "Router not found." };
  }
  if (!router.tunnelIp || router.connectionMethod === "direct") {
    return {
      error: "Le routeur doit être connecté via WireGuard ou OpenVPN pour activer l'accès direct.",
    };
  }

  const existing = await db
    .select()
    .from(routerPortForwards)
    .where(
      and(
        eq(routerPortForwards.routerId, routerId),
        eq(routerPortForwards.service, service),
        eq(routerPortForwards.status, "active"),
      ),
    )
    .limit(1);
  if (existing.length > 0) {
    return { success: true, publicPort: existing[0].publicPort, relayHost: process.env.WG_RELAY_HOST };
  }

  if (service === "mikhmon" || service === "ssh") {
    let client: RouterOSClient | null = null;
    try {
      client = await connectToRouter(router);
      if (service === "mikhmon") await ensureMikhmonTunnelNat(client);
      if (service === "ssh") await setSshServiceEnabled(client, true);
    } catch (err) {
      return {
        error:
          err instanceof Error
            ? `Could not prepare ${service} access on router: ${err.message}`
            : `Could not prepare ${service} access on router.`,
      };
    } finally {
      client?.close();
    }
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

  // Payment isn't wired up yet — every plan is granted for free for now,
  // but the chosen period + computed expiry are recorded so the UI can
  // already show "expires on"/renewal, and so enforcement can switch on
  // later without a data migration once billing actually goes live.
  await db.insert(routerPortForwards).values({
    routerId,
    service,
    targetPort,
    publicPort,
    tunnelIp: router.tunnelIp,
    status: "active",
    billingPeriod,
    expiresAt: expiresAtFor(billingPeriod),
  });

  return { success: true, publicPort, relayHost: process.env.WG_RELAY_HOST };
}

/**
 * Services auto-enabled right after a WireGuard/OpenVPN install completes
 * (see installed/route.ts), so a freshly installed router is immediately
 * reachable from WinBox/WebFig without the admin having to find and click
 * the "Accès distant" page first — the gap that caused a fresh install to
 * look "broken" even though the tunnel itself was healthy.
 */
const AUTO_ENABLED_SERVICES_AFTER_INSTALL = ["winbox", "webfig", "ssh"] as const;

export async function autoEnablePostInstallAccess(routerId: string) {
  const results: Record<string, Awaited<ReturnType<typeof enablePortForwardForRouter>>> = {};
  for (const service of AUTO_ENABLED_SERVICES_AFTER_INSTALL) {
    results[service] = await enablePortForwardForRouter(routerId, service);
  }
  return results;
}

export async function enablePortForward(
  routerId: string,
  service: string,
  billingPeriod: BillingPeriod = "monthly",
) {
  const session = await getSession();
  if (!session) return { error: "Not authenticated." };

  const db = getDb();
  const [router] = await db
    .select({ orgId: routers.orgId })
    .from(routers)
    .where(eq(routers.id, routerId))
    .limit(1);
  if (!router || router.orgId !== session.orgId) {
    return { error: "Router not found." };
  }

  const result = await enablePortForwardForRouter(routerId, service, billingPeriod);

  revalidatePath("/admin/remote-access");
  revalidatePath("/admin/router");
  return result;
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

  if (forward.service === "ssh") {
    const [fullRouter] = await db
      .select()
      .from(routers)
      .where(eq(routers.id, forward.routerId))
      .limit(1);
    if (fullRouter) {
      let client: RouterOSClient | null = null;
      try {
        client = await connectToRouter(fullRouter);
        await setSshServiceEnabled(client, false);
      } catch {
        // Non-fatal — the public forward is already gone, so ssh isn't
        // reachable from outside anymore even if the service stays on.
      } finally {
        client?.close();
      }
    }
  }

  await db.delete(routerPortForwards).where(eq(routerPortForwards.id, forwardId));

  revalidatePath("/admin/remote-access");
  revalidatePath("/admin/router");
  return { success: true };
}
