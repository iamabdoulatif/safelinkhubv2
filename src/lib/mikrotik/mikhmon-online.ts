"use server";

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { routers } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import { connectToRouter } from "./router-sync";
import { REMOTE_ACCESS_PORT, DOCKER_WEB_PORT, HOTSPOT_BRIDGE_NAME } from "./constants";

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
 */
export async function getMikhmonLink(routerId: string) {
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

    if (!ddnsName) {
      return {
        success: true,
        ready: false,
        localLink,
        message:
          "Le nom DDNS du routeur n'est pas encore disponible — relancez l'auto-setup (étape MikroTik Cloud) ou réessayez dans quelques secondes." +
          (localLink ? ` En attendant, l'accès local reste joignable : ${localLink}.` : ""),
      };
    }

    return {
      success: true,
      ready: true,
      link: `http://${ddnsName}:${REMOTE_ACCESS_PORT}`,
      ddnsName,
      localLink,
    };
  } catch (err) {
    return {
      error: err instanceof Error ? `Lookup failed: ${err.message}` : "Lookup failed.",
    };
  } finally {
    client.close();
  }
}
