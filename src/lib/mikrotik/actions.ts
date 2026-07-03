"use server";

import { revalidatePath } from "next/cache";
import { randomBytes, randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { routers, organizations } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import { RouterOSClient } from "./client";
import { encryptSecret } from "./crypto";
import { API_USERNAME, INSTALL_TOKEN_TTL_MS, hashToken } from "./install-token";
import { syncRouterStats, connectToRouter, refreshStaleRouters } from "./router-sync";
import { revokeVpnPeer, revokeOpenvpnPeer } from "./relay";

export async function connectRouter(_prevState: unknown, formData: FormData) {
  const session = await getSession();
  if (!session) return { error: "Not authenticated." };

  const name = String(formData.get("name") ?? "").trim();
  const host = String(formData.get("host") ?? "").trim();
  const apiPort = Number(formData.get("apiPort") ?? 8728);
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!name || !host || !username) {
    return { error: "Name, host, and username are required." };
  }

  const client = new RouterOSClient();
  let model = "Unknown";

  try {
    await client.connect(host, apiPort, username, password);
    const [resource] = await client.talk(["/system/resource/print"]);
    model = resource?.["board-name"] ?? "Unknown";
    // Push the admin-chosen name to the router itself instead of adopting
    // whatever identity it already had (often just the factory default).
    await client.talk(["/system/identity/set", `=name=${name}`]);
  } catch (err) {
    client.close();
    return {
      error:
        err instanceof Error
          ? `Could not connect to router: ${err.message}`
          : "Could not connect to router.",
    };
  } finally {
    client.close();
  }

  const db = getDb();
  await db.insert(routers).values({
    orgId: session.orgId,
    name,
    model,
    host,
    apiPort,
    username,
    passwordEncrypted: encryptSecret(password),
    status: "online",
    lastSyncAt: new Date(),
  });

  revalidatePath("/admin/router");
  revalidatePath("/admin/settings/router-setup");
  return { success: true };
}

export async function refreshRouterStats(routerId: string) {
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
  if (!router.host || !router.username || !router.passwordEncrypted) {
    return { error: "Router is missing connection details." };
  }

  const result = await syncRouterStats(routerId);
  if (!result.success) return { error: result.error };

  revalidatePath("/admin/router");
  return { success: true };
}

/** Resynchronise tous les routeurs de l'organisation (bouton "Synchroniser"
 * de la liste) — délègue à refreshStaleRouters avec un seuil nul pour forcer
 * la lecture même des routeurs synchronisés récemment. */
export async function refreshAllRouters() {
  const session = await getSession();
  if (!session) return { error: "Not authenticated." };

  await refreshStaleRouters(session.orgId, 0);

  revalidatePath("/admin/router");
  return { success: true };
}

export async function generateInstallScript(
  _prevState: unknown,
  formData: FormData,
) {
  const session = await getSession();
  if (!session) return { error: "Not authenticated." };

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Router name is required." };

  const db = getDb();
  const [org] = await db
    .select({ slug: organizations.slug })
    .from(organizations)
    .where(eq(organizations.id, session.orgId))
    .limit(1);
  if (!org) return { error: "Organization not found." };

  // The VPN peer itself is allocated lazily when the router actually fetches
  // the script (see the install-vpn route handler) so that the peer's
  // private key never needs to be persisted server-side.
  const apiPassword = randomBytes(18).toString("base64url");
  const installToken = randomUUID();

  const [router] = await db
    .insert(routers)
    .values({
      orgId: session.orgId,
      name,
      apiPort: 8728,
      username: API_USERNAME,
      passwordEncrypted: encryptSecret(apiPassword),
      status: "pending",
      connectionMethod: "vpn",
      installTokenHash: hashToken(installToken),
      installTokenExpiresAt: new Date(Date.now() + INSTALL_TOKEN_TTL_MS),
    })
    .returning();

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

  const scriptUrl = `${appUrl}/api/router/v1/${org.slug}/scripts/install-vpn`;
  const fetchMode = scriptUrl.startsWith("https://") ? "https" : "http";
  // [find name=ether1] resolves to the port's real internal .id under the
  // hood — unlike passing "ether1" as the API's bare =numbers= convenience
  // (which doesn't reliably resolve for physical ethernet ports, see
  // container-setup.ts's WAN rename), the RouterOS CLI's own [find ...]
  // selector always does. A no-op (not an error) if ether1 doesn't exist
  // or was already renamed, so this is safe to run on every install.
  // /interface/wifi/set [find] disabled=no enables every WiFi radio the
  // board has (no-op if it has none) — just the on/off flag here, not the
  // band/width/SSID/country tuning provisionHotspotStack does, since this
  // one-shot script only ever runs the VPN install, not the full
  // auto-setup.
  const command = `/interface/ethernet/set [find name=ether1] name=E1-WAN-FAI; /interface/wifi/set [find] disabled=no; /tool fetch url="${scriptUrl}" http-header-field="Authorization: Bearer ${installToken}" dst-path="vpn.rsc" mode=${fetchMode}; :delay 2s; /import file-name="vpn.rsc"; :delay 1s; /ip route remove [find dst-address=10.66.0.0/24 gateway=safelinkhub-wg0]; /ip route add dst-address=10.66.0.0/24 gateway=safelinkhub-wg0; :delay 1s; /file remove "vpn.rsc"`;

  revalidatePath("/admin/settings/router-setup");
  return { success: true, routerId: router.id, command };
}

export async function deleteRouter(routerId: string) {
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

  // If the router is still reachable over its WireGuard tunnel, strip the
  // safelinkhub-wg0 interface/peer/route from the router itself before
  // revoking the peer on the relay — otherwise the router is left with a
  // dead WireGuard config pointing at a peer slot that's about to be freed
  // and reassigned to someone else, and it just sits there retrying a
  // handshake that will never succeed. This must run BEFORE the relay-side
  // revoke below: once that peer slot is gone, the tunnel can't be reached
  // at all, so there'd be nothing left to clean up over.
  if (router.connectionMethod === "vpn" && router.status === "online") {
    try {
      const client = await connectToRouter(router, 8000);
      try {
        // RouterOS's API needs each entry's own .id to remove it — unlike
        // named objects (interfaces, bridges), peers/routes/addresses are
        // anonymous, so find-then-remove is the only way (no inline
        // [find ...] expression support over the API, only over the CLI).
        const peers = await client
          .talk(["/interface/wireguard/peers/print", "?interface=safelinkhub-wg0"])
          .catch(() => []);
        for (const peer of peers) {
          await client.talk(["/interface/wireguard/peers/remove", `=numbers=${peer[".id"]}`]).catch(() => {});
        }

        const tunnelRoutes = await client
          .talk(["/ip/route/print", "?dst-address=10.66.0.0/24", "?gateway=safelinkhub-wg0"])
          .catch(() => []);
        for (const route of tunnelRoutes) {
          await client.talk(["/ip/route/remove", `=numbers=${route[".id"]}`]).catch(() => {});
        }

        const tunnelAddresses = await client
          .talk(["/ip/address/print", "?interface=safelinkhub-wg0"])
          .catch(() => []);
        for (const address of tunnelAddresses) {
          await client.talk(["/ip/address/remove", `=numbers=${address[".id"]}`]).catch(() => {});
        }

        // Last on purpose: removing the interface itself is what actually
        // kills the tunnel our own connection is running over, so anything
        // after it would never get a response anyway.
        await client.talk(["/interface/wireguard/remove", "=numbers=safelinkhub-wg0"]).catch(() => {});
      } finally {
        client.close();
      }
    } catch {
      // Router unreachable despite status="online" (stale status, tunnel
      // already down, etc.) — nothing to clean up on-device, fall through
      // to removing the SafeLinkHub-side records regardless.
    }
  }

  // Free up the peer slot on the relay so it doesn't linger forever.
  try {
    if (router.connectionMethod === "vpn" && router.wgPeerPublicKey) {
      await revokeVpnPeer(router.wgPeerPublicKey);
    } else if (router.connectionMethod === "openvpn" && router.tunnelIp) {
      const [org] = await db
        .select({ slug: organizations.slug })
        .from(organizations)
        .where(eq(organizations.id, router.orgId))
        .limit(1);
      if (org) {
        await revokeOpenvpnPeer(`${org.slug}-${router.name}`);
      }
    }
  } catch {
    // Best-effort: the relay might be unreachable, but we still want the
    // router record itself removed from SafeLinkHub.
  }

  await db.delete(routers).where(eq(routers.id, routerId));

  revalidatePath("/admin/router");
  revalidatePath("/admin/settings/router-setup");
  revalidatePath("/admin/remote-access");
  return { success: true };
}

/**
 * "Réinitialiser le processus" used to just delete SafeLinkHub's own DB
 * row (same as "Supprimer le routeur") — the live RouterOS device kept
 * every interface/bridge/peer SafeLinkHub had configured, so re-running
 * the wizard against the same physical router started from a half-
 * configured state instead of a clean one, and WinBox still showed the
 * old WireGuard tunnel/peer indefinitely. This sends an actual factory
 * reset (/system/reset-configuration, no-defaults — wipes everything,
 * not just back to RouterOS's stock defaults) to the live device first,
 * best-effort, then does the same SafeLinkHub-side cleanup deleteRouter
 * does. The reset command reboots the router immediately and never
 * returns a normal reply, so a thrown/timed-out call here is treated as
 * "command was sent", not a failure — the device's own factory-reset is
 * what's authoritative on whether it actually cleared.
 */
export async function resetRouterDevice(routerId: string) {
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

  let deviceReset = false;
  try {
    const client = await connectToRouter(router, 8000);
    try {
      // Matches the exact CLI form confirmed working directly on-device —
      // skip-backup=yes used to be sent too, and its error (if RouterOS
      // rejected it) was being silently swallowed by a blanket .catch,
      // which then unconditionally reported deviceReset=true regardless
      // of whether the command actually ran. The reset itself reboots the
      // router immediately with no normal reply, so the connection
      // dropping/timing out here IS the expected success signal — but a
      // real rejection (bad parameter, permission denied) must still
      // surface instead of being masked the same way.
      await client.talk(["/system/reset-configuration", "=no-defaults=yes"]);
      deviceReset = true;
    } catch (err) {
      // RouterOS reboots almost immediately on a valid reset-configuration
      // call, so the connection dropping/timing out IS the expected
      // success signal here, not a failure — but a genuine rejection
      // (bad parameter, permission denied) replies with a normal !trap
      // first and never reboots, and that one must still be surfaced.
      // client.ts's talk() turns a !trap into an Error carrying RouterOS's
      // own =message= text — those don't look like network/socket
      // failures, which is what distinguishes the two cases here.
      const msg = err instanceof Error ? err.message : "";
      const looksLikeConnectionDrop = /econnreset|closed|timeout|not connected|length prefix|EOF/i.test(
        msg,
      );
      deviceReset = looksLikeConnectionDrop || msg === "";
    } finally {
      client.close();
    }
  } catch {
    // Router unreachable — nothing to reset on-device, fall through to
    // removing the SafeLinkHub-side records regardless.
  }

  try {
    if (router.connectionMethod === "vpn" && router.wgPeerPublicKey) {
      await revokeVpnPeer(router.wgPeerPublicKey);
    } else if (router.connectionMethod === "openvpn" && router.tunnelIp) {
      const [org] = await db
        .select({ slug: organizations.slug })
        .from(organizations)
        .where(eq(organizations.id, router.orgId))
        .limit(1);
      if (org) {
        await revokeOpenvpnPeer(`${org.slug}-${router.name}`);
      }
    }
  } catch {
    // Best-effort: the relay might be unreachable, but we still want the
    // router record itself removed from SafeLinkHub.
  }

  await db.delete(routers).where(eq(routers.id, routerId));

  revalidatePath("/admin/router");
  revalidatePath("/admin/settings/router-setup");
  revalidatePath("/admin/remote-access");
  return {
    success: true,
    deviceReset,
    message: deviceReset
      ? "Commande de réinitialisation envoyée au routeur — il redémarre à l'état d'usine. Reconnectez-vous-y directement (WinBox/MAC) pour le relier à nouveau."
      : "Routeur inaccessible — seule la configuration SafeLinkHub a été supprimée. Réinitialisez l'appareil manuellement (bouton reset) avant de le relier à nouveau.",
  };
}

export async function generateOpenvpnInstallScript(
  _prevState: unknown,
  formData: FormData,
) {
  const session = await getSession();
  if (!session) return { error: "Not authenticated." };

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Router name is required." };

  const db = getDb();
  const [org] = await db
    .select({ slug: organizations.slug })
    .from(organizations)
    .where(eq(organizations.id, session.orgId))
    .limit(1);
  if (!org) return { error: "Organization not found." };

  // The OpenVPN credentials themselves are allocated lazily when the router
  // actually fetches the script (see the install-openvpn route handler) so
  // that they never need to be persisted server-side.
  const apiPassword = randomBytes(18).toString("base64url");
  const installToken = randomUUID();

  const [router] = await db
    .insert(routers)
    .values({
      orgId: session.orgId,
      name,
      apiPort: 8728,
      username: API_USERNAME,
      passwordEncrypted: encryptSecret(apiPassword),
      status: "pending",
      connectionMethod: "openvpn",
      installTokenHash: hashToken(installToken),
      installTokenExpiresAt: new Date(Date.now() + INSTALL_TOKEN_TTL_MS),
    })
    .returning();

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

  const scriptUrl = `${appUrl}/api/router/v1/${org.slug}/scripts/install-openvpn`;
  const fetchMode = scriptUrl.startsWith("https://") ? "https" : "http";
  const command = `/tool fetch url="${scriptUrl}" http-header-field="Authorization: Bearer ${installToken}" dst-path="ovpn.rsc" mode=${fetchMode}; :delay 2s; /import file-name="ovpn.rsc"; :delay 1s; /file remove "ovpn.rsc"`;

  revalidatePath("/admin/settings/router-setup");
  revalidatePath("/admin/remote-access");
  return { success: true, routerId: router.id, command };
}

export async function checkRouterConnection(routerId: string) {
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
  if (router.status === "online") {
    revalidatePath("/admin/router");
    revalidatePath("/admin/settings/router-setup");
    return { connected: true };
  }
  if (!router.host || !router.username || !router.passwordEncrypted) {
    return { connected: false };
  }

  const result = await syncRouterStats(routerId, {
    timeoutMs: 15000,
    markOfflineOnFailure: false,
  });
  if (!result.success) return { connected: false };

  revalidatePath("/admin/router");
  revalidatePath("/admin/settings/router-setup");
  return { connected: true };
}
