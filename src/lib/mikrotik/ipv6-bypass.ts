"use server";

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { routers } from "@/lib/db/schema";
import { getSession, isSuperAdmin } from "@/lib/auth/session";
import { connectToRouter } from "./router-sync";
import { enableExitNat, disableExitNat } from "./relay";
import { HOTSPOT_BRIDGE_NAME } from "./constants";
import type { RouterOSClient } from "./client";

/**
 * "Bypass IPv6" — routes a MikroTik's hotspot-client Internet traffic into the
 * existing SafeLinkHub WireGuard tunnel (safelinkhub-wg0) so it exits via the
 * VPS-relay's public IPv4. For FAI that only hand out IPv6 with CGNAT/DS-Lite
 * (no usable public IPv4), or where some services behave badly over IPv6.
 *
 *   Clients → MikroTik → tunnel WireGuard → VPS (IPv4 publique) → Internet
 *
 * Only the hotspot LAN bridge traffic is marked into the tunnel; the router's
 * own traffic (management, updates, the tunnel handshake itself) stays on the
 * native WAN, which avoids a routing loop on the WireGuard endpoint. The VPS
 * side (masquerade out its WAN) is handled by enableExitNat/disableExitNat in
 * relay.ts. Reuses the same tunnel already installed by the VPN flow — there
 * is no second interface to provision.
 */

const WG_INTERFACE = "safelinkhub-wg0";
// Restores the management-only scope when the bypass is turned off — mirrors
// what install-vpn's script sets when the tunnel is first installed.
const MANAGEMENT_ALLOWED = "10.66.0.0/24";
const ROUTING_TABLE = "ipv6-bypass";
const COMMENT = "SafeLinkHub IPv6 Bypass";
// Private ranges whose destination stays on the native path (LAN-local +
// SafeLinkHub tunnel subnet), so only Internet-bound client traffic is
// pushed through the tunnel. Subnet-independent: works regardless of which
// address plan the hotspot bridge uses.
const PRIVATE_DSTS = ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"];

/** LAN bridges whose clients' traffic should be routed through the tunnel. */
async function findHotspotBridges(
  client: RouterOSClient,
  preferredBridgeName: string | null,
): Promise<string[]> {
  const candidates = Array.from(
    new Set([preferredBridgeName || HOTSPOT_BRIDGE_NAME, "HOTSPOT"]),
  );
  const found: string[] = [];
  for (const name of candidates) {
    const rows = await client.talk(["/interface/bridge/print", `?name=${name}`]);
    if (rows.length > 0) found.push(name);
  }
  return found;
}

/** Applies the RouterOS-side bypass config. Idempotent (print-before-add). */
async function applyRouterBypass(client: RouterOSClient, bridges: string[]) {
  // 1. Full-tunnel: let WireGuard encrypt any destination to the peer. A
  //    superset of the management scope, so existing management still routes.
  const peers = await client.talk([
    "/interface/wireguard/peers/print",
    `?interface=${WG_INTERFACE}`,
  ]);
  if (peers.length === 0) {
    throw new Error(
      `Le tunnel WireGuard ${WG_INTERFACE} est introuvable sur le routeur.`,
    );
  }
  for (const p of peers) {
    await client.talk([
      "/interface/wireguard/peers/set",
      `=numbers=${p[".id"]}`,
      "=allowed-address=0.0.0.0/0",
    ]);
  }

  // 2. Dedicated routing table for the marked client traffic.
  const tables = await client.talk([
    "/routing/table/print",
    `?name=${ROUTING_TABLE}`,
  ]);
  if (tables.length === 0) {
    await client.talk(["/routing/table/add", `=name=${ROUTING_TABLE}`, "=fib=yes"]);
  }

  // 3. Default route in that table pointing into the tunnel.
  const routes = await client.talk(["/ip/route/print", `?comment=${COMMENT}`]);
  if (routes.length === 0) {
    await client.talk([
      "/ip/route/add",
      "=dst-address=0.0.0.0/0",
      `=gateway=${WG_INTERFACE}`,
      `=routing-table=${ROUTING_TABLE}`,
      `=comment=${COMMENT}`,
    ]);
  }

  // 4. Per bridge: skip-marking accepts for private/tunnel destinations first
  //    (so intra-LAN + management stay direct), then mark the rest into the
  //    bypass table. Added accepts-before-mark so top-down mangle order holds.
  for (const bridge of bridges) {
    for (const priv of PRIVATE_DSTS) {
      const existing = await client.talk([
        "/ip/firewall/mangle/print",
        "?chain=prerouting",
        `?in-interface=${bridge}`,
        `?dst-address=${priv}`,
        "?action=accept",
        `?comment=${COMMENT}`,
      ]);
      if (existing.length === 0) {
        await client.talk([
          "/ip/firewall/mangle/add",
          "=chain=prerouting",
          `=in-interface=${bridge}`,
          `=dst-address=${priv}`,
          "=action=accept",
          `=comment=${COMMENT}`,
        ]);
      }
    }

    const existingMark = await client.talk([
      "/ip/firewall/mangle/print",
      "?chain=prerouting",
      `?in-interface=${bridge}`,
      "?action=mark-routing",
      `?comment=${COMMENT}`,
    ]);
    if (existingMark.length === 0) {
      await client.talk([
        "/ip/firewall/mangle/add",
        "=chain=prerouting",
        `=in-interface=${bridge}`,
        "=action=mark-routing",
        `=new-routing-mark=${ROUTING_TABLE}`,
        "=passthrough=no",
        `=comment=${COMMENT}`,
      ]);
    }
  }

  // 5. Src-nat client packets to the tunnel IP before they enter the tunnel,
  //    so the relay's wg0 cryptokey-routing (allowed-ips=10.66.0.X/32) accepts
  //    them. Without this the relay silently drops the client's private src.
  const srcnat = await client.talk([
    "/ip/firewall/nat/print",
    "?chain=srcnat",
    `?out-interface=${WG_INTERFACE}`,
    "?action=masquerade",
    `?comment=${COMMENT}`,
  ]);
  if (srcnat.length === 0) {
    await client.talk([
      "/ip/firewall/nat/add",
      "=chain=srcnat",
      `=out-interface=${WG_INTERFACE}`,
      "=action=masquerade",
      `=comment=${COMMENT}`,
    ]);
  }
}

/** Removes the RouterOS-side bypass config and restores management-only scope. */
async function removeRouterBypass(client: RouterOSClient) {
  const remove = async (menu: string, rows: Record<string, string>[]) => {
    for (const r of rows) {
      if (r[".id"]) await client.talk([`${menu}/remove`, `=numbers=${r[".id"]}`]);
    }
  };

  await remove(
    "/ip/firewall/mangle",
    await client.talk(["/ip/firewall/mangle/print", `?comment=${COMMENT}`]),
  );
  await remove(
    "/ip/firewall/nat",
    await client.talk(["/ip/firewall/nat/print", `?comment=${COMMENT}`]),
  );
  // Route before table — the route references the table.
  await remove(
    "/ip/route",
    await client.talk(["/ip/route/print", `?comment=${COMMENT}`]),
  );
  await remove(
    "/routing/table",
    await client.talk(["/routing/table/print", `?name=${ROUTING_TABLE}`]),
  );

  const peers = await client.talk([
    "/interface/wireguard/peers/print",
    `?interface=${WG_INTERFACE}`,
  ]);
  for (const p of peers) {
    await client.talk([
      "/interface/wireguard/peers/set",
      `=numbers=${p[".id"]}`,
      `=allowed-address=${MANAGEMENT_ALLOWED}`,
    ]);
  }
}

// ---------------------------------------------------------------------------
// FAI IPv6/CGNAT diagnostic
// ---------------------------------------------------------------------------

/** Classifies an IPv4 by its allocation, to tell a usable public IP apart. */
function classifyIpv4(ip: string): "public" | "cgnat" | "private" | "special" {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) {
    return "special";
  }
  const [a, b] = parts;
  if (a === 10) return "private";
  if (a === 172 && b >= 16 && b <= 31) return "private";
  if (a === 192 && b === 168) return "private";
  // CGNAT / shared address space (RFC 6598) — the hallmark of DS-Lite/CGNAT.
  if (a === 100 && b >= 64 && b <= 127) return "cgnat";
  if (a === 127 || a === 0 || a === 169 || a >= 224) return "special";
  return "public";
}

/** True for a global-unicast IPv6 (2000::/3) — not link-local, not ULA. */
function isGlobalIpv6(address: string): boolean {
  const head = address.trim().toLowerCase().split("/")[0];
  const firstGroup = parseInt(head.split(":")[0] || "0", 16);
  if (Number.isNaN(firstGroup)) return false;
  // 2000::/3 spans 0x2000–0x3fff. Excludes fe80 (link-local) and fc/fd (ULA).
  return firstGroup >= 0x2000 && firstGroup <= 0x3fff;
}

/**
 * Probes a router to decide whether its FAI leaves it without a usable public
 * IPv4 — the exact situation "Bypass IPv6" is meant for. Reads the router's
 * own IPv4/IPv6 addresses (no external call, no dependence on the WAN
 * interface name): if every IPv4 it holds is CGNAT (100.64/10) or private and
 * a global IPv6 is present, the FAI is IPv6-first / CGNAT and the bypass is
 * recommended. A real public IPv4 anywhere means the bypass isn't needed.
 */
export async function detectIspIpv6(routerId: string) {
  const loaded = await loadOwnedRouter(routerId);
  if ("error" in loaded) return loaded;
  const { router } = loaded;

  let client;
  try {
    client = await connectToRouter(router);
  } catch (err) {
    return {
      error:
        err instanceof Error ? `Connexion impossible : ${err.message}` : "Connexion impossible.",
    };
  }

  try {
    const v4rows = await client.talk(["/ip/address/print"]);
    let publicIpv4: string | null = null;
    let cgnat = false;
    for (const row of v4rows) {
      if (row.disabled === "true") continue;
      const ip = (row.address ?? "").split("/")[0];
      if (!ip) continue;
      const kind = classifyIpv4(ip);
      if (kind === "public" && !publicIpv4) publicIpv4 = ip;
      if (kind === "cgnat") cgnat = true;
    }

    // The IPv6 menu doesn't exist when the ipv6 package is disabled — treat
    // that (and any error) as "no global IPv6".
    let ipv6 = false;
    try {
      const v6rows = await client.talk(["/ipv6/address/print"]);
      ipv6 = v6rows.some(
        (row) =>
          row.disabled !== "true" &&
          row["link-local"] !== "true" &&
          isGlobalIpv6(row.address ?? ""),
      );
    } catch {
      ipv6 = false;
    }

    const hasPublicV4 = publicIpv4 !== null;
    const recommended = !hasPublicV4;

    let verdict: string;
    if (hasPublicV4) {
      verdict = `IPv4 publique détectée (${publicIpv4}). Le Bypass IPv6 n'est pas nécessaire.`;
    } else if (ipv6 && cgnat) {
      verdict =
        "FAI en IPv6 avec IPv4 partagée en CGNAT (100.64.x.x) — pas d'IPv4 publique. Bypass IPv6 recommandé.";
    } else if (ipv6) {
      verdict =
        "FAI principalement en IPv6, aucune IPv4 publique. Bypass IPv6 recommandé.";
    } else if (cgnat) {
      verdict =
        "IPv4 partagée en CGNAT/DS-Lite (100.64.x.x), pas d'IPv4 publique. Bypass IPv6 recommandé.";
    } else {
      verdict =
        "Aucune IPv4 publique détectée sur le routeur (derrière NAT). Bypass IPv6 recommandé.";
    }

    return { success: true as const, hasPublicV4, publicIpv4, cgnat, ipv6, recommended, verdict };
  } catch (err) {
    return {
      error:
        err instanceof Error ? `Diagnostic échoué : ${err.message}` : "Diagnostic échoué.",
    };
  } finally {
    client.close();
  }
}

async function loadOwnedRouter(routerId: string) {
  const session = await getSession();
  if (!session) return { error: "Not authenticated." as const };

  const db = getDb();
  const [router] = await db
    .select()
    .from(routers)
    .where(eq(routers.id, routerId))
    .limit(1);

  if (!router || (router.orgId !== session.orgId && !isSuperAdmin(session.role))) {
    return { error: "Router not found." as const };
  }
  return { router, db };
}

export async function enableIpv6Bypass(routerId: string) {
  const loaded = await loadOwnedRouter(routerId);
  if ("error" in loaded) return loaded;
  const { router, db } = loaded;

  if (router.connectionMethod !== "vpn" || !router.tunnelIp) {
    return {
      error:
        "Le Bypass IPv6 nécessite un tunnel WireGuard SafeLinkHub actif sur ce routeur.",
    };
  }

  let client;
  try {
    client = await connectToRouter(router);
  } catch (err) {
    return {
      error:
        err instanceof Error ? `Connexion impossible : ${err.message}` : "Connexion impossible.",
    };
  }

  try {
    const bridges = await findHotspotBridges(client, router.hotspotBridgeName);
    if (bridges.length === 0) {
      return { error: "Aucun bridge LAN hotspot trouvé sur le routeur." };
    }

    await applyRouterBypass(client, bridges);

    // VPS side: masquerade this tunnel IP out the relay's WAN. On failure,
    // roll the router config back so we never leave a half-applied bypass.
    try {
      await enableExitNat(router.tunnelIp);
    } catch (err) {
      await removeRouterBypass(client).catch(() => {});
      return {
        error:
          err instanceof Error
            ? `Configuration du VPS échouée : ${err.message}`
            : "Configuration du VPS échouée.",
      };
    }

    await db
      .update(routers)
      .set({ ipv6BypassEnabled: true, ipv6BypassEnabledAt: new Date() })
      .where(eq(routers.id, router.id));

    return { success: true, enabled: true };
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? `Activation du Bypass IPv6 échouée : ${err.message}`
          : "Activation du Bypass IPv6 échouée.",
    };
  } finally {
    client.close();
  }
}

export async function disableIpv6Bypass(routerId: string) {
  const loaded = await loadOwnedRouter(routerId);
  if ("error" in loaded) return loaded;
  const { router, db } = loaded;

  let client;
  try {
    client = await connectToRouter(router);
  } catch (err) {
    return {
      error:
        err instanceof Error ? `Connexion impossible : ${err.message}` : "Connexion impossible.",
    };
  }

  try {
    await removeRouterBypass(client);
    if (router.tunnelIp) {
      await disableExitNat(router.tunnelIp).catch(() => {});
    }

    await db
      .update(routers)
      .set({ ipv6BypassEnabled: false, ipv6BypassEnabledAt: null })
      .where(eq(routers.id, router.id));

    return { success: true, enabled: false };
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? `Désactivation du Bypass IPv6 échouée : ${err.message}`
          : "Désactivation du Bypass IPv6 échouée.",
    };
  } finally {
    client.close();
  }
}
