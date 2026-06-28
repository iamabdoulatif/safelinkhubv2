"use server";

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { routers } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import { connectToRouter } from "./router-sync";
import type { RouterOSClient } from "./client";
import { HOTSPOT_BRIDGE_NAME } from "./constants";
import { ROUTER_SETUP_PROFILE } from "./router-setup-profile";
import type { HotspotStackOptions } from "./container-setup";

export type ConfigAuditItem = {
  key: string;
  label: string;
  status: "ok" | "missing" | "incomplete";
  detail?: string;
};

const CONTAINER_NAME = "mikhmonv3-safelinkhub:latest";
const DOCKER_BRIDGE_NAME = ROUTER_SETUP_PROFILE.containerBridge.name;
const VETH_NAME = ROUTER_SETUP_PROFILE.containerBridge.vethName;

/**
 * Reads the router's *live* state directly (not SafeLinkHub's DB) so a
 * device that already had some configuration before being connected here
 * — or one where a previous auto-setup run only partially completed —
 * gets called out explicitly instead of silently looking "configured"
 * from the DB's point of view. Best-effort: a check that fails to read is
 * just omitted rather than failing the whole audit.
 *
 * Bridge/server names are read from the router's own saved
 * hotspotBridgeName/hotspotServerName (falling back to the defaults) —
 * this used to hardcode the pre-rename "SAFELINKHUB-BRIDGE" name, so it
 * reported the hotspot bridge as permanently "missing" on every router
 * that had already been through a successful auto-setup run.
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

  const bridgeName = router.hotspotBridgeName?.trim() || HOTSPOT_BRIDGE_NAME;
  const serverName = router.hotspotServerName?.trim() || "hotspot1";
  const savedConfig = router.lastAutoSetupConfig as HotspotStackOptions | null;

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
      .talk(["/interface/bridge/print", `?name=${bridgeName}`])
      .catch(() => []);
    let hotspotProfile: Record<string, string> | undefined;
    if (bridge.length === 0) {
      items.push({
        key: "bridge",
        label: "Bridge hotspot",
        status: "missing",
        detail: `Aucun bridge ${bridgeName} — lancez l'auto-setup pour le créer.`,
      });
    } else {
      const addr = await client
        .talk(["/ip/address/print", `?interface=${bridgeName}`])
        .catch(() => []);
      const hotspot = await client
        .talk(["/ip/hotspot/print", `?interface=${bridgeName}`])
        .catch(() => []);
      hotspotProfile = hotspot[0];
      if (addr.length === 0) {
        items.push({
          key: "bridge",
          label: "Bridge hotspot",
          status: "incomplete",
          detail: "Bridge créé mais sans adresse IP — relancez l'auto-setup pour la compléter.",
        });
      } else if (hotspot.length === 0) {
        items.push({
          key: "bridge",
          label: "Bridge hotspot",
          status: "incomplete",
          detail: "Adresse IP présente mais aucun service hotspot actif — lancez l'auto-setup pour le configurer.",
        });
      } else {
        items.push({
          key: "bridge",
          label: "Bridge hotspot",
          status: hotspot[0].name === serverName ? "ok" : "incomplete",
          detail:
            hotspot[0].name === serverName
              ? undefined
              : `Serveur hotspot actif mais nommé "${hotspot[0].name}" au lieu de "${serverName}" — relancez l'auto-setup pour le réconcilier.`,
        });
      }
    }

    // Captive portal: the hotspot profile's html-directory is only as
    // good as the files actually sitting in it — this is the check that
    // catches a /tool fetch that silently failed to write anything (see
    // captive-template-upload.ts) instead of just trusting that the
    // profile field is set.
    const htmlDirectory =
      hotspotProfile?.profile &&
      (await client
        .talk(["/ip/hotspot/profile/print", `?name=${hotspotProfile.profile}`])
        .catch(() => []))[0]?.["html-directory"];
    const resolvedHtmlDirectory = htmlDirectory || savedConfig?.htmlDirectory?.trim() || "hotspot";
    if (router.connectionMethod !== "direct" || bridge.length > 0) {
      const portalFile = await client
        .talk(["/file/print", `?name=${resolvedHtmlDirectory}/login.html`])
        .catch(() => []);
      items.push(
        portalFile.length > 0 && Number(portalFile[0].size ?? 0) > 0
          ? { key: "portal", label: "Portail captif", status: "ok" }
          : {
              key: "portal",
              label: "Portail captif",
              status: "missing",
              detail: `Aucun fichier login.html dans ${resolvedHtmlDirectory}/ — l'envoi a probablement échoué, relancez l'auto-setup pour réessayer.`,
            },
      );
    }

    const dockerBridge = await client
      .talk(["/interface/bridge/print", `?name=${DOCKER_BRIDGE_NAME}`])
      .catch(() => []);
    const veth = await client.talk(["/interface/veth/print", `?name=${VETH_NAME}`]).catch(() => []);
    const container = await client
      .talk(["/container/print", `?name=${CONTAINER_NAME}`])
      .catch(() => []);
    if (container.length === 0) {
      items.push({
        key: "mikhmon",
        label: "Conteneur MikHmon",
        status: "missing",
        detail:
          dockerBridge.length === 0 || veth.length === 0
            ? "Bridge/veth Docker absents en plus du conteneur — relancez l'auto-setup (nécessite device-mode container=yes confirmé physiquement)."
            : "Bridge/veth Docker présents mais le conteneur n'a jamais été créé — relancez l'auto-setup pour le pull depuis Docker Hub.",
      });
    } else {
      items.push({
        key: "mikhmon",
        label: "Conteneur MikHmon",
        status: container[0].status === "running" ? "ok" : "incomplete",
        detail:
          container[0].status === "running"
            ? undefined
            : `Conteneur présent mais statut "${container[0].status}" — peut nécessiter quelques minutes après un /system/reboot pour démarrer.`,
      });
    }
  } finally {
    client.close();
  }

  return { success: true, items, canRepair: !!savedConfig };
}
