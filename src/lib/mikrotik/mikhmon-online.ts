"use server";

import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { routers, routerPortForwards } from "@/lib/db/schema";
import { getSession, isSuperAdmin } from "@/lib/auth/session";
import { connectToRouter } from "./router-sync";
import { REMOTE_ACCESS_PORT, DOCKER_WEB_PORT, HOTSPOT_BRIDGE_NAME } from "./constants";
import { getRelayPublicHost } from "./relay";

/**
 * MikHmon is exposed through two dst-nat rules provisionHotspotStack
 * creates directly on the router's own WAN (not through SafeLinkHub's
 * relay):
 *   - "ACCES DISTANT": dst-port=8088 -> 11.11.11.11:80, no dst-address
 *     filter, so it's reachable from anywhere on the internet via the
 *     router's public IP or its MikroTik Cloud DDNS name (/ip cloud
 *     dns-name — needed since CGNAT routers have no static public IP).
 *   - "Docker NAT": dst-port=8087, dst-address=<hotspot gateway IP> ->
 *     11.11.11.11:80, only reachable from inside the hotspot's own LAN/WiFi.
 * Both links are returned so the admin can pick whichever is reachable
 * from where they're standing.
 *
 * The dns-name + NAT rule being correctly configured does NOT guarantee the
 * remote link actually works: many WAN connections (4G/SIM dongles
 * especially) sit behind the carrier's own CGNAT, which silently drops
 * inbound connections to the public IP no matter how the router's own NAT
 * is set up — there is nothing RouterOS-side that fixes this. We probe the
 * link from the server before calling it "ready" so the admin gets an
 * accurate answer instead of a link that times out in the browser.
 */
async function probeReachable(url: string, timeoutMs = 5000): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: "GET", signal: controller.signal, redirect: "manual" });
    return res.status > 0;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function getMikhmonLink(routerId: string) {
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

  let client;
  try {
    client = await connectToRouter(router);
  } catch (err) {
    return {
      error: err instanceof Error ? `Could not connect: ${err.message}` : "Could not connect.",
    };
  }

  try {
    const [cloud] = await client.talk(["/ip/cloud/print"]);
    const ddnsName = cloud?.["dns-name"] ?? null;

    const [hotspotAddress] = await client
      .talk(["/ip/address/print", `?interface=${HOTSPOT_BRIDGE_NAME}`])
      .catch(() => []);
    const hotspotIp = hotspotAddress?.address?.split("/")[0] ?? null;
    const localLink = hotspotIp ? `http://${hotspotIp}:${DOCKER_WEB_PORT}` : null;

    // The router already maintains an outbound WireGuard/OpenVPN tunnel to
    // SafeLinkHub's relay for management — toggling the "mikhmon" direct-
    // access service (Accès distant) carries MikHmon over that same
    // tunnel, bypassing the WAN/CGNAT situation entirely. The page used
    // to only ever *mention* this in the warning text without showing the
    // actual link, leaving the admin to go find it themselves — surfaced
    // directly here instead whenever that service is already active.
    const [mikhmonForward] = await db
      .select({ publicPort: routerPortForwards.publicPort })
      .from(routerPortForwards)
      .where(
        and(
          eq(routerPortForwards.routerId, routerId),
          eq(routerPortForwards.service, "mikhmon"),
          eq(routerPortForwards.status, "active"),
        ),
      )
      .limit(1);
    const tunnelLink = mikhmonForward
      ? `http://${getRelayPublicHost(router.relayShard)}:${mikhmonForward.publicPort}`
      : null;

    if (!ddnsName) {
      return {
        success: true,
        ready: false,
        localLink,
        tunnelLink,
        message:
          "Le nom DDNS du routeur n'est pas encore disponible — relancez l'auto-setup (étape MikroTik Cloud) ou réessayez dans quelques secondes." +
          (localLink ? ` En attendant, l'accès local reste joignable : ${localLink}.` : "") +
          (tunnelLink ? ` Le lien via tunnel VPN reste joignable dans tous les cas : ${tunnelLink}.` : ""),
      };
    }

    const link = `http://${ddnsName}:${REMOTE_ACCESS_PORT}`;
    const reachable = await probeReachable(link);

    // The router already maintains an outbound WireGuard/OpenVPN tunnel to
    // SafeLinkHub's relay for management — that same tunnel can carry
    // MikHmon traffic too (toggle it on from Accès distant), bypassing
    // whatever the WAN/CGNAT situation is entirely.
    const tunnelAvailable = router.connectionMethod !== "direct" && Boolean(router.tunnelIp);

    return {
      success: true,
      ready: true,
      reachable,
      link,
      ddnsName,
      localLink,
      tunnelLink,
      message: reachable
        ? undefined
        : "Le DDNS et la redirection NAT sont bien configurés, mais le port 8088 ne répond pas depuis l'extérieur. C'est presque toujours dû à un CGNAT côté opérateur (fréquent sur connexion 4G/SIM) qui bloque les connexions entrantes vers l'IP publique, même si le routeur lui-même est correctement configuré — aucun réglage RouterOS ne peut contourner ça. Utilisez l'accès local ci-dessous si vous êtes sur le réseau du hotspot" +
            (tunnelLink
              ? `, ou le lien via tunnel VPN ci-dessous (fonctionne même derrière un CGNAT) : ${tunnelLink}.`
              : tunnelAvailable
                ? ", ou activez « MikHmon (vouchers) » dans Accès distant pour y accéder via le tunnel VPN déjà utilisé pour la gestion à distance (fonctionne même derrière un CGNAT)."
                : ", ou passez par une connexion WAN avec une vraie IP publique (fibre/ADSL) pour l'accès distant."),
    };
  } catch (err) {
    return {
      error: err instanceof Error ? `Lookup failed: ${err.message}` : "Lookup failed.",
    };
  } finally {
    client.close();
  }
}
