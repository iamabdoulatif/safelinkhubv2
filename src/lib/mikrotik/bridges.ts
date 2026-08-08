"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { routers, bridges, organizations } from "@/lib/db/schema";
import { getSession, isSuperAdmin } from "@/lib/auth/session";
import { getAppUrl } from "@/lib/net/app-url";
import { RouterOSClient } from "./client";
import { decryptSecret } from "./crypto";
import { openRouterTunnelWithRetry } from "./relay";
import { hashToken, INSTALL_TOKEN_TTL_MS } from "./install-token";
import { HOTSPOT_BRIDGE_NAME } from "./constants";

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

type InterfaceRow = Record<string, string>;

function toManagedPort(r: InterfaceRow) {
  return {
    name: r.name,
    type: r.type,
    running: r.running === "true",
    disabled: r.disabled === "true",
  };
}

export async function listRouterInterfaces(routerId: string) {
  const session = await getSession();
  if (!session) return { error: "Not authenticated." };

  const db = getDb();
  const [router] = await db
    .select()
    .from(routers)
    .where(eq(routers.id, routerId))
    .limit(1);
  if (!router || (router.orgId !== session.orgId && !isSuperAdmin(session.role))) {
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
    const rows = await client.talk(["/interface/print"]);
    const wifiRows = await client.talk(["/interface/wifi/print"]).catch(() => []);
    const portsByName = new Map<string, ReturnType<typeof toManagedPort>>();

    rows
      .filter(
        (r) =>
          (r.type === "ether" || r.type === "wlan" || r.type === "wifi" || r.type === "veth") &&
          !r.name?.startsWith("safelinkhub-"),
      )
      .forEach((r) => portsByName.set(r.name, toManagedPort(r)));

    wifiRows
      .filter((r) => r.name && !r.name.startsWith("safelinkhub-"))
      .forEach((r) => {
        portsByName.set(r.name, toManagedPort({ ...r, type: "wifi" }));
      });

    return { success: true, ports: Array.from(portsByName.values()) };
  } catch (err) {
    return {
      error:
        err instanceof Error ? `Failed to list interfaces: ${err.message}` : "Failed to list interfaces.",
    };
  } finally {
    client.close();
  }
}


export async function saveBridge(_prevState: unknown, formData: FormData) {
  const session = await getSession();
  if (!session) return { error: "Not authenticated." };

  const routerId = String(formData.get("routerId") ?? "");
  const name = String(formData.get("name") ?? "").trim() || "SAFELINKHUB-BRIDGE";
  const gatewayIp = String(formData.get("gatewayIp") ?? "").trim();
  const subnetBits = Number(formData.get("subnetBits") ?? 24);
  const hotspotEnabled = formData.get("hotspotEnabled") === "on";
  const preventSharing = formData.get("preventSharing") === "on";
  const ports = formData.getAll("ports").map(String).filter(Boolean);

  if (!gatewayIp) return { error: "Gateway IP is required." };
  if (ports.length === 0) return { error: "Assign at least one port to this bridge." };

  const db = getDb();
  const [router] = await db
    .select()
    .from(routers)
    .where(eq(routers.id, routerId))
    .limit(1);
  if (!router || (router.orgId !== session.orgId && !isSuperAdmin(session.role))) {
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
    // Idempotent: only create the bridge if it doesn't already exist. The
    // previous remove-then-add sequence broke whenever the bridge already
    // had ports/IP/DHCP attached (RouterOS refuses to remove an interface
    // still referenced by dependent config) — remove failed silently, then
    // add failed with a duplicate-name error, leaving every subsequent
    // =bridge=${name} reference pointing at a bridge that, as far as that
    // failed run was concerned, never got (re)created.
    const existingBridge = await client.talk(["/interface/bridge/print", `?name=${name}`]).catch(() => []);
    if (existingBridge.length === 0) {
      await client.talk(["/interface/bridge/add", `=name=${name}`]);
    }

    // Move each port onto this bridge rather than blindly /add-ing — a
    // physical/WiFi interface can only be a port of one bridge at a time,
    // so if it's already slaved to a different bridge (the factory
    // default, or another SafeLinkHub bridge), /add fails outright instead
    // of switching it over.
    for (const port of ports) {
      const existingPort = await client
        .talk(["/interface/bridge/port/print", `?interface=${port}`])
        .catch(() => []);
      if (existingPort.length > 0) {
        if (existingPort[0].bridge !== name) {
          await client.talk([
            "/interface/bridge/port/set",
            `=numbers=${existingPort[0][".id"]}`,
            `=bridge=${name}`,
          ]);
        }
      } else {
        await client.talk([
          "/interface/bridge/port/add",
          `=bridge=${name}`,
          `=interface=${port}`,
        ]);
      }
    }

    const existingAddress = await client
      .talk(["/ip/address/print", `?interface=${name}`])
      .catch(() => []);
    if (existingAddress.length === 0 || existingAddress[0].address !== `${gatewayIp}/${subnetBits}`) {
      for (const addr of existingAddress) {
        await client.talk(["/ip/address/remove", `=numbers=${addr[".id"]}`]).catch(() => {});
      }
      await client.talk([
        "/ip/address/add",
        `=address=${gatewayIp}/${subnetBits}`,
        `=interface=${name}`,
      ]);
    }

    // The topology step only prepares the L2 bridge shape. DHCP, hotspot
    // server/profile, pool and TTL rules are created later by the
    // canonical auto-setup path, which is the only place allowed to create
    // the RouterOS hotspot server. Creating a draft server here left two
    // servers after auto-setup: the correct hotspot1 plus the stale
    // topology placeholder.
  } catch (err) {
    return {
      error:
        err instanceof Error ? `Failed to apply config: ${err.message}` : "Failed to apply config.",
    };
  } finally {
    client.close();
  }

  let bootstrapToken: string | null = null;
  const values: typeof bridges.$inferInsert = {
    routerId,
    name,
    gatewayIp,
    subnetBits,
    ports,
    hotspotEnabled,
    preventSharing,
    pppoeEnabled: false,
  };

  if (hotspotEnabled) {
    bootstrapToken = randomUUID();
    values.bootstrapStatus = "pending";
    values.bootstrapTokenHash = hashToken(bootstrapToken);
    values.bootstrapTokenExpiresAt = new Date(Date.now() + INSTALL_TOKEN_TTL_MS);
  }

  const [existingSavedBridge] = await db
    .select({ id: bridges.id })
    .from(bridges)
    .where(and(eq(bridges.routerId, routerId), eq(bridges.name, name)))
    .limit(1);
  const [bridge] = existingSavedBridge
    ? await db.update(bridges).set(values).where(eq(bridges.id, existingSavedBridge.id)).returning()
    : await db.insert(bridges).values(values).returning();

  revalidatePath("/admin/settings/router-setup");

  if (!bootstrapToken) {
    return { success: true };
  }

  const [org] = await db
    .select({ slug: organizations.slug })
    .from(organizations)
    .where(eq(organizations.id, session.orgId))
    .limit(1);

  const appUrl = getAppUrl();
  const scriptUrl = `${appUrl}/api/router/v1/${org?.slug}/scripts/bootstrap`;
  const fetchMode = scriptUrl.startsWith("https://") ? "https" : "http";
  const bootstrapCommand = `/tool fetch url="${scriptUrl}" http-header-field="Authorization: Bearer ${bootstrapToken}" dst-path="bootstrap.rsc" mode=${fetchMode}; :delay 2s; /import file-name="bootstrap.rsc"; :delay 1s; /file remove "bootstrap.rsc"`;

  return { success: true, bridgeId: bridge.id, bootstrapCommand };
}

export async function testHotspotConfig(bridgeId: string) {
  const session = await getSession();
  if (!session) return { error: "Not authenticated." };

  const db = getDb();
  const [bridge] = await db.select().from(bridges).where(eq(bridges.id, bridgeId)).limit(1);
  if (!bridge) return { error: "Bridge not found." };

  const [router] = await db
    .select()
    .from(routers)
    .where(eq(routers.id, bridge.routerId))
    .limit(1);
  if (!router || (router.orgId !== session.orgId && !isSuperAdmin(session.role))) {
    return { error: "Router not found." };
  }
  if (!bridge.hotspotEnabled) {
    return { error: "Le hotspot n'est pas activé sur ce bridge." };
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
    // The auto-setup (container-setup.ts) never names the server/profile
    // after the bridge — it creates a server attached to whichever bridge
    // interface name the admin chose there (default HOTSPOT_BRIDGE_NAME,
    // "SAFELINKHUB-BRIDGE"), persisted on the router row. Looking up
    // "${bridge.name}-hotspot"/"${bridge.name}-profile" here matched
    // nothing that auto-setup (or anything else) ever creates, so this
    // check reported "Aucun serveur hotspot trouvé" unconditionally even
    // on a correctly configured router. Find the server by its actual
    // interface instead.
    const liveBridgeName = router.hotspotBridgeName?.trim() || HOTSPOT_BRIDGE_NAME;
    const [hotspot] = await client
      .talk(["/ip/hotspot/print", `?interface=${liveBridgeName}`])
      .catch(() => []);
    if (!hotspot) {
      return {
        success: true,
        bridgeName: bridge.name,
        running: false,
        message: "Aucun serveur hotspot trouvé pour ce bridge sur le routeur.",
      };
    }

    const [profile] = await client
      .talk(["/ip/hotspot/profile/print", `?name=${hotspot.profile}`])
      .catch(() => []);
    const activeUsers = await client
      .talk(["/ip/hotspot/active/print", `?interface=${liveBridgeName}`])
      .catch(() => []);

    return {
      success: true,
      bridgeName: bridge.name,
      running: hotspot.disabled !== "true",
      gatewayIp: bridge.gatewayIp,
      hotspotAddress: profile?.["hotspot-address"] ?? bridge.gatewayIp,
      activeUsers: activeUsers.length,
    };
  } catch (err) {
    return {
      error: err instanceof Error ? `Test failed: ${err.message}` : "Test failed.",
    };
  } finally {
    client.close();
  }
}
