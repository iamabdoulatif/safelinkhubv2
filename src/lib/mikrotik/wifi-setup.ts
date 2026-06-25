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

/**
 * Applies one SSID across both radios (5GHz wifi1 + 2.4GHz wifi2), mirroring
 * a working AX2 hAP config: open hotspot network (auth happens via the
 * captive portal/voucher, not a WiFi passphrase), ap mode, the standard
 * 5ghz-ax / 2ghz-ax bands.
 */
export async function configureWifiSsid(
  routerId: string,
  ssid: string,
  dualBand: boolean = true,
) {
  const session = await getSession();
  if (!session) return { error: "Not authenticated." };

  const trimmed = ssid.trim();
  if (!trimmed) return { error: "Le nom du Wi-Fi (SSID) est requis." };
  if (trimmed.length > 32) return { error: "Le SSID doit faire 32 caractères maximum." };

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

  const log: string[] = [];
  // Single-radio boards (e.g. hAP ax lite) only ever expose "wifi1", and
  // it's their one 2.4GHz radio rather than the 5GHz one dual-band boards
  // put there — so the band/width assigned to wifi1 depends on dualBand too.
  // Width and skip-dfs-channels are pinned to match the confirmed-working
  // hAP ax² config every run, instead of leaving RouterOS defaults in place.
  const radios = dualBand
    ? [
        { name: "wifi1", band: "5ghz-ax", width: "20/40/80mhz" },
        { name: "wifi2", band: "2ghz-ax", width: "20/40mhz" },
      ]
    : [{ name: "wifi1", band: "2ghz-ax", width: "20/40mhz" }];

  try {
    for (const radio of radios) {
      try {
        await client.talk([
          "/interface/wifi/set",
          `=numbers=${radio.name}`,
          `=channel.band=${radio.band}`,
          `=channel.width=${radio.width}`,
          "=channel.skip-dfs-channels=all",
          "=configuration.mode=ap",
          `=configuration.ssid=${trimmed}`,
          "=disabled=no",
        ]);
        log.push(`OK: ${radio.name} (${radio.band}, ${radio.width}) SSID set to "${trimmed}"`);
      } catch (err) {
        log.push(
          `SKIP (${radio.name}): ${err instanceof Error ? err.message : "error"}`,
        );
      }
    }
    return { success: true, log };
  } finally {
    client.close();
  }
}
