"use server";

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { routers } from "@/lib/db/schema";
import { getSession, isSuperAdmin } from "@/lib/auth/session";
import { connectToRouter } from "./router-sync";

/**
 * Enables MikroTik's own "Back To Home" (BTH) feature on a router — their
 * official Android/iPhone app + cloud relay for remote access, completely
 * separate from SafeLinkHub's own WireGuard/OpenVPN relay. This only
 * automates the RouterOS-side switch (/ip/cloud back-to-home-vpn=enabled);
 * MikroTik's design requires the *first* pairing of the BTH app itself to
 * happen interactively while the phone is on the router's local Wi-Fi
 * (entering the router's local IP, username, and password in the app) —
 * no script can substitute for that step. As a fallback/extra, this also
 * returns the WireGuard config + QR code RouterOS generates once BTH is
 * on, which works with the *generic* WireGuard app immediately, without
 * needing that local-Wi-Fi pairing dance.
 */
export async function enableBackToHome(routerId: string) {
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
      error:
        err instanceof Error ? `Could not connect: ${err.message}` : "Could not connect.",
    };
  }

  try {
    await client.talk(["/ip/cloud/set", "=ddns-enabled=yes"]);
    await client.talk(["/ip/cloud/set", "=back-to-home-vpn=enabled"]);

    // The cloud needs a moment to negotiate the relay + generate the
    // WireGuard client config/QR code after first enabling BTH.
    await new Promise((r) => setTimeout(r, 3000));

    const [cloud] = await client.talk(["/ip/cloud/print"]);

    const ddnsName = cloud?.["dns-name"] ?? null;
    const wgConfig = cloud?.["vpn-wireguard-client-config"] ?? null;
    const wgQrCode = cloud?.["vpn-wireguard-client-config-qrcode"] ?? null;

    if (!wgConfig) {
      return {
        success: true,
        ready: false,
        ddnsName,
        message:
          "Back To Home activé sur le routeur. La configuration WireGuard n'est pas encore disponible — réessayez dans quelques secondes (le cloud MikroTik met parfois un peu de temps à la générer).",
      };
    }

    return {
      success: true,
      ready: true,
      ddnsName,
      wgConfig,
      wgQrCode,
    };
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? `Failed to enable Back To Home: ${err.message}`
          : "Failed to enable Back To Home.",
    };
  } finally {
    client.close();
  }
}

export async function getBackToHomeStatus(routerId: string) {
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
      error:
        err instanceof Error ? `Could not connect: ${err.message}` : "Could not connect.",
    };
  }

  try {
    const [cloud] = await client.talk(["/ip/cloud/print"]);
    return {
      success: true,
      enabled: cloud?.["back-to-home-vpn"] === "enabled",
      ddnsName: cloud?.["dns-name"] ?? null,
      wgConfig: cloud?.["vpn-wireguard-client-config"] ?? null,
      wgQrCode: cloud?.["vpn-wireguard-client-config-qrcode"] ?? null,
    };
  } catch (err) {
    return {
      error: err instanceof Error ? `Status check failed: ${err.message}` : "Status check failed.",
    };
  } finally {
    client.close();
  }
}
