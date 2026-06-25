"use server";

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { routers } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import { connectToRouter } from "./router-sync";
import { REMOTE_ACCESS_PORT } from "./container-setup";

/**
 * MikHmon is exposed to the internet directly from the router's own WAN
 * (the "ACCES DISTANT" dst-nat rule provisionHotspotStack creates, forwarding
 * REMOTE_ACCESS_PORT to the container) — not through SafeLinkHub's own
 * relay. Routers behind CGNAT have no static public IP, so the reachable
 * address is the router's own MikroTik Cloud DDNS hostname instead
 * (/ip cloud dns-name, enabled by the same auto-setup step).
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

    if (!ddnsName) {
      return {
        success: true,
        ready: false,
        message:
          "Le nom DDNS du routeur n'est pas encore disponible — relancez l'auto-setup (étape MikroTik Cloud) ou réessayez dans quelques secondes.",
      };
    }

    return {
      success: true,
      ready: true,
      link: `http://${ddnsName}:${REMOTE_ACCESS_PORT}`,
      ddnsName,
    };
  } catch (err) {
    return {
      error: err instanceof Error ? `Lookup failed: ${err.message}` : "Lookup failed.",
    };
  } finally {
    client.close();
  }
}
