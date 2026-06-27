"use server";

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { routers } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import { connectToRouter } from "./router-sync";
import type { RouterOSClient } from "./client";

export type ConfigAuditItem = {
  key: string;
  label: string;
  status: "ok" | "missing" | "incomplete";
  detail?: string;
};

/**
 * Reads the router's *live* state directly (not SafeLinkHub's DB) so a
 * device that already had some configuration before being connected here
 * — or one where a previous auto-setup run only partially completed —
 * gets called out explicitly instead of silently looking "configured"
 * from the DB's point of view. Best-effort: a check that fails to read is
 * just omitted rather than failing the whole audit.
 */
export async function auditRouterConfig(routerId: string) {
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
    client = await connectToRouter(router, 10000);
  } catch (err) {
    return {
      error: err instanceof Error ? `Connexion impossible : ${err.message}` : "Connexion impossible.",
    };
  }

  const items: ConfigAuditItem[] = [];

  try {
    if (router.connectionMethod === "vpn") {
      const wg = await client
        .talk(["/interface/wireguard/print", "?name=safelinkhub-wg0"])
        .catch(() => []);
      if (wg.length === 0) {
        items.push({
          key: "vpn",
          label: "Tunnel WireGuard",
          status: "missing",
          detail: "Aucune interface safelinkhub-wg0 sur le routeur — la connexion VPN semble cassée malgré le statut enregistré.",
        });
      } else {
        const addr = await client
          .talk(["/ip/address/print", "?interface=safelinkhub-wg0"])
          .catch(() => []);
        items.push(
          addr.length > 0
            ? { key: "vpn", label: "Tunnel WireGuard", status: "ok" }
            : {
                key: "vpn",
                label: "Tunnel WireGuard",
                status: "incomplete",
                detail: "Interface présente mais sans adresse IP assignée.",
              },
        );
      }
    } else if (router.connectionMethod === "openvpn") {
      const ovpn = await client.talk(["/interface/ovpn-client/print"]).catch(() => []);
      items.push(
        ovpn.length > 0
          ? { key: "vpn", label: "Client OpenVPN", status: "ok" }
          : {
              key: "vpn",
              label: "Client OpenVPN",
              status: "missing",
              detail: "Aucun client OpenVPN configuré sur le routeur.",
            },
      );
    }

    const bridge = await client
      .talk(["/interface/bridge/print", "?name=SAFELINKHUB-BRIDGE"])
      .catch(() => []);
    if (bridge.length === 0) {
      items.push({
        key: "bridge",
        label: "Bridge hotspot",
        status: "missing",
        detail: "Aucun bridge SAFELINKHUB-BRIDGE — à créer ci-dessous.",
      });
    } else {
      const addr = await client
        .talk(["/ip/address/print", "?interface=SAFELINKHUB-BRIDGE"])
        .catch(() => []);
      const hotspot = await client
        .talk(["/ip/hotspot/print", "?interface=SAFELINKHUB-BRIDGE"])
        .catch(() => []);
      if (addr.length === 0) {
        items.push({
          key: "bridge",
          label: "Bridge hotspot",
          status: "incomplete",
          detail: "Bridge créé mais sans adresse IP — complétez sa configuration ci-dessous.",
        });
      } else if (hotspot.length === 0) {
        items.push({
          key: "bridge",
          label: "Bridge hotspot",
          status: "incomplete",
          detail: "Adresse IP présente mais aucun service hotspot actif — lancez l'auto-setup pour le configurer.",
        });
      } else {
        items.push({ key: "bridge", label: "Bridge hotspot", status: "ok" });
      }
    }

    const container = await client
      .talk(["/container/print", "?name=mikhmon-sf-v1:latest"])
      .catch(() => []);
    items.push(
      container.length > 0
        ? { key: "mikhmon", label: "Conteneur MikHmon", status: "ok" }
        : {
            key: "mikhmon",
            label: "Conteneur MikHmon",
            status: "missing",
            detail: "Pas encore installé — créé par l'auto-setup si l'appareil le supporte.",
          },
    );
  } finally {
    client.close();
  }

  return { success: true, items };
}
