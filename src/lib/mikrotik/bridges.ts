"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { routers, bridges, organizations } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import { RouterOSClient } from "./client";
import { decryptSecret } from "./crypto";
import { openRouterTunnelWithRetry } from "./relay";
import { hashToken, INSTALL_TOKEN_TTL_MS } from "./install-token";

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
    const rows = await client.talk(["/interface/print"]);
    const wifiRows = await client.talk(["/interface/wifi/print"]).catch(() => []);
    const portsByName = new Map<string, ReturnType<typeof toManagedPort>>();

    rows
      .filter(
        (r) =>
          (r.type === "ether" || r.type === "wlan" || r.type === "wifi") &&
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

export async function listBridges(routerId: string) {
  const db = getDb();
  return db.select().from(bridges).where(eq(bridges.routerId, routerId));
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
    await client.talk(["/interface/bridge/remove", `=numbers=${name}`]).catch(() => {});
    await client.talk(["/interface/bridge/add", `=name=${name}`]);

    for (const port of ports) {
      await client.talk([
        "/interface/bridge/port/add",
        `=bridge=${name}`,
        `=interface=${port}`,
      ]);
    }

    await client
      .talk(["/ip/address/remove", `=numbers=${gatewayIp}/${subnetBits}`])
      .catch(() => {});
    await client.talk([
      "/ip/address/add",
      `=address=${gatewayIp}/${subnetBits}`,
      `=interface=${name}`,
    ]);

    if (hotspotEnabled) {
      const poolName = `${name}-pool`;
      const [, , , ip3] = gatewayIp.split(".");
      const rangeStart = `${gatewayIp.split(".").slice(0, 3).join(".")}.10`;
      const rangeEnd = `${gatewayIp.split(".").slice(0, 3).join(".")}.254`;
      void ip3;

      await client
        .talk(["/ip/pool/add", `=name=${poolName}`, `=ranges=${rangeStart}-${rangeEnd}`])
        .catch(() => {});
      await client
        .talk([
          "/ip/dhcp-server/add",
          `=name=${name}-dhcp`,
          `=interface=${name}`,
          `=address-pool=${poolName}`,
        ])
        .catch(() => {});
      await client
        .talk([
          "/ip/dhcp-server/network/add",
          `=address=${gatewayIp.split(".").slice(0, 3).join(".")}.0/${subnetBits}`,
          `=gateway=${gatewayIp}`,
        ])
        .catch(() => {});
      await client
        .talk([
          "/ip/hotspot/profile/add",
          `=name=${name}-profile`,
          "=hotspot-address=" + gatewayIp,
        ])
        .catch(() => {});
      await client
        .talk([
          "/ip/hotspot/add",
          `=name=${name}-hotspot`,
          `=interface=${name}`,
          `=address-pool=${poolName}`,
          `=profile=${name}-profile`,
        ])
        .catch(() => {});

      if (preventSharing) {
        await client
          .talk([
            "/ip/firewall/mangle/add",
            "=chain=postrouting",
            `=out-interface=${name}`,
            "=action=change-ttl",
            "=new-ttl=set:1",
            "=comment=safelinkhub-prevent-sharing",
          ])
          .catch(() => {});
      }
    }
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

  const [bridge] = await db.insert(bridges).values(values).returning();

  revalidatePath("/admin/settings/router-setup");

  if (!bootstrapToken) {
    return { success: true };
  }

  const [org] = await db
    .select({ slug: organizations.slug })
    .from(organizations)
    .where(eq(organizations.id, session.orgId))
    .limit(1);

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
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
  if (!router || router.orgId !== session.orgId) {
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
    const [hotspot] = await client.talk(["/ip/hotspot/print", `?name=${bridge.name}-hotspot`]);
    if (!hotspot) {
      return {
        success: true,
        bridgeName: bridge.name,
        running: false,
        message: "Aucun serveur hotspot trouvé pour ce bridge sur le routeur.",
      };
    }

    const [profile] = await client
      .talk(["/ip/hotspot/profile/print", `?name=${bridge.name}-profile`])
      .catch(() => []);
    const activeUsers = await client
      .talk(["/ip/hotspot/active/print", `?interface=${bridge.name}`])
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

export async function checkBootstrapInstalled(bridgeId: string) {
  const session = await getSession();
  if (!session) return { error: "Not authenticated." };

  const db = getDb();
  const [bridge] = await db
    .select({ id: bridges.id, bootstrapStatus: bridges.bootstrapStatus, routerId: bridges.routerId })
    .from(bridges)
    .where(eq(bridges.id, bridgeId))
    .limit(1);

  if (!bridge) return { installed: false };

  const [router] = await db
    .select({ orgId: routers.orgId })
    .from(routers)
    .where(eq(routers.id, bridge.routerId))
    .limit(1);

  if (!router || router.orgId !== session.orgId) return { installed: false };

  return { installed: bridge.bootstrapStatus === "installed" };
}
