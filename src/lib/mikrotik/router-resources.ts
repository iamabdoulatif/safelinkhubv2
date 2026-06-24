"use server";

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { routers } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import { RouterOSClient } from "./client";
import { decryptSecret } from "./crypto";
import { openRouterTunnelWithRetry } from "./relay";

async function connectClient(router: typeof routers.$inferSelect, timeoutMs = 20000) {
  if (!router.host || !router.username || !router.passwordEncrypted) {
    throw new Error("Router is missing connection details.");
  }
  const password = decryptSecret(router.passwordEncrypted);
  const client = new RouterOSClient();
  if (router.connectionMethod === "vpn" || router.connectionMethod === "openvpn") {
    const tunnel = await openRouterTunnelWithRetry(router.host, router.apiPort ?? 8728, timeoutMs);
    await client.connectViaStream(tunnel.stream, router.username, password, timeoutMs);
  } else {
    await client.connect(router.host, router.apiPort ?? 8728, router.username, password, timeoutMs);
  }
  return client;
}

export type RouterResources = {
  identity: string;
  uptime: string;
  freeMemory: string;
  totalMemory: string;
  cpu: string;
  cpuCount: string;
  cpuFrequency: string;
  cpuLoad: string;
  freeHddSpace: string;
  totalHddSpace: string;
  writeSectSinceReboot: string;
  writeSectTotal: string;
  badBlocks: string;
  architectureName: string;
  boardName: string;
  version: string;
  buildTime: string;
  factorySoftware: string;
};

/**
 * Live equivalent of WinBox's System > Resources dialog — fetched on demand
 * rather than cached, since uptime/CPU/memory are only meaningful in the
 * moment.
 */
export async function getRouterResources(routerId: string) {
  const session = await getSession();
  if (!session) return { error: "Not authenticated." };

  const db = getDb();
  const [router] = await db
    .select()
    .from(routers)
    .where(eq(routers.id, routerId))
    .limit(1);
  if (!router || router.orgId !== session.orgId) {
    return { error: "Router not found." };
  }

  let client: RouterOSClient;
  try {
    client = await connectClient(router);
  } catch (err) {
    return {
      error:
        err instanceof Error ? `Could not connect: ${err.message}` : "Could not connect.",
    };
  }

  try {
    const [resource] = await client.talk(["/system/resource/print"]);
    const [identityRow] = await client.talk(["/system/identity/print"]).catch(() => []);

    const resources: RouterResources = {
      identity: identityRow?.name ?? router.name,
      uptime: resource?.uptime ?? "",
      freeMemory: resource?.["free-memory"] ?? "",
      totalMemory: resource?.["total-memory"] ?? "",
      cpu: resource?.cpu ?? "",
      cpuCount: resource?.["cpu-count"] ?? "",
      cpuFrequency: resource?.["cpu-frequency"] ?? "",
      cpuLoad: resource?.["cpu-load"] ?? "",
      freeHddSpace: resource?.["free-hdd-space"] ?? "",
      totalHddSpace: resource?.["total-hdd-space"] ?? "",
      writeSectSinceReboot: resource?.["write-sect-since-reboot"] ?? "",
      writeSectTotal: resource?.["write-sect-total"] ?? "",
      badBlocks: resource?.["bad-blocks"] ?? "",
      architectureName: resource?.["architecture-name"] ?? "",
      boardName: resource?.["board-name"] ?? "",
      version: resource?.version ?? "",
      buildTime: resource?.["build-time"] ?? "",
      factorySoftware: resource?.["factory-software"] ?? "",
    };

    return { success: true, resources };
  } catch (err) {
    return {
      error:
        err instanceof Error ? `Failed to read resources: ${err.message}` : "Failed to read resources.",
    };
  } finally {
    client.close();
  }
}
