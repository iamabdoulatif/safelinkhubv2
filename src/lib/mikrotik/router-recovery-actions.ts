"use server";

import { randomBytes, randomUUID } from "crypto";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { organizations, routerReplacements, routers, vpnAccessAuditEvents } from "@/lib/db/schema";
import { getSession, isSuperAdmin } from "@/lib/auth/session";
import { getAppUrl } from "@/lib/net/app-url";
import { encryptSecret } from "./crypto";
import { API_USERNAME, INSTALL_TOKEN_TTL_MS, hashToken } from "./install-token";
import { revokeOpenvpnPeer, revokeVpnPeer } from "./relay";
import {
  buildReplacementInstallCommand,
  canRetryReplacement,
  canStartRouterReplacement,
  type ReplacementTunnelMethod,
} from "./router-recovery";
import { getActiveRouterReplacement } from "./router-recovery-service";

function replacementUrl(origin: string, slug: string, method: ReplacementTunnelMethod) {
  return `${origin}/api/router/v1/${slug}/scripts/${method === "openvpn" ? "install-openvpn" : "install-vpn"}`;
}

async function sourceForSession(routerId: string) {
  const session = await getSession();
  if (!session) return { error: "Non authentifié." as const };
  const db = getDb();
  const [router] = await db.select().from(routers).where(eq(routers.id, routerId)).limit(1);
  if (!router || (router.orgId !== session.orgId && !isSuperAdmin(session.role))) {
    return { error: "Routeur introuvable." as const };
  }
  return { session, router };
}

async function createInstallCommand(routerId: string, token: string) {
  const db = getDb();
  const [router] = await db.select().from(routers).where(eq(routers.id, routerId)).limit(1);
  if (!router) return null;
  const [org] = await db.select({ slug: organizations.slug }).from(organizations).where(eq(organizations.id, router.orgId)).limit(1);
  if (!org) return null;
  const method: ReplacementTunnelMethod = router.connectionMethod === "openvpn" ? "openvpn" : "vpn";
  const scriptUrl = replacementUrl(getAppUrl(), org.slug, method);
  return {
    method,
    command: buildReplacementInstallCommand(scriptUrl, token, method),
    expiresAt: router.installTokenExpiresAt,
  };
}

export async function startRouterReplacement(routerId: string, replacementName: string) {
  const result = await sourceForSession(routerId);
  if ("error" in result) return result;
  const { router, session } = result;
  if (router.connectionMethod !== "vpn" && router.connectionMethod !== "openvpn") {
    return { error: "Le routeur source doit déjà disposer d'un tunnel VPN." };
  }
  if (router.status === "replaced") return { error: "Ce routeur a déjà été remplacé." };
  const active = await getActiveRouterReplacement(router.id);
  if (active && !canStartRouterReplacement(active.status)) {
    return { error: "Une reprise est déjà en cours pour ce routeur." };
  }

  const name = replacementName.trim().slice(0, 80);
  if (!name) return { error: "Le nom du routeur de remplacement est requis." };

  const db = getDb();
  const token = randomUUID();
  const apiPassword = randomBytes(18).toString("base64url");
  const [replacementRouter] = await db
    .insert(routers)
    .values({
      orgId: router.orgId,
      name,
      model: router.model,
      apiPort: 8728,
      username: API_USERNAME,
      passwordEncrypted: encryptSecret(apiPassword),
      status: "pending",
      connectionMethod: router.connectionMethod,
      relayShard: router.relayShard,
      autoSetupBilled: router.autoSetupBilled,
      captiveTemplateId: router.captiveTemplateId,
      lastAutoSetupConfig: router.lastAutoSetupConfig,
      installTokenHash: hashToken(token),
      installTokenExpiresAt: new Date(Date.now() + INSTALL_TOKEN_TTL_MS),
    })
    .returning();
  const [replacement] = await db
    .insert(routerReplacements)
    .values({
      orgId: router.orgId,
      sourceRouterId: router.id,
      replacementRouterId: replacementRouter.id,
      requestedBy: session.userId,
      status: "pending",
    })
    .returning();
  await db.insert(vpnAccessAuditEvents).values({
    actorUserId: session.userId,
    orgId: router.orgId,
    routerId: router.id,
    replacementId: replacement.id,
    action: "replacement_started",
  });
  const command = await createInstallCommand(replacementRouter.id, token);
  revalidatePath("/admin/remote-access");
  revalidatePath("/admin/vpn-access");
  return { success: true as const, replacementId: replacement.id, replacementRouterId: replacementRouter.id, ...command };
}

export async function retryRouterReplacement(replacementId: string) {
  const session = await getSession();
  if (!session) return { error: "Non authentifié." };
  const db = getDb();
  const [replacement] = await db.select().from(routerReplacements).where(eq(routerReplacements.id, replacementId)).limit(1);
  if (!replacement || (replacement.orgId !== session.orgId && !isSuperAdmin(session.role))) {
    return { error: "Reprise introuvable." };
  }
  if (!canRetryReplacement(replacement.status)) return { error: "Cette reprise ne peut pas être relancée." };
  const [router] = await db.select().from(routers).where(eq(routers.id, replacement.replacementRouterId)).limit(1);
  if (!router) return { error: "Routeur de remplacement introuvable." };
  const [source] = await db.select().from(routers).where(eq(routers.id, replacement.sourceRouterId)).limit(1);
  if (router.wgPeerPublicKey) await revokeVpnPeer(router.wgPeerPublicKey).catch(() => {});
  if (router.connectionMethod === "openvpn") {
    const [org] = await db.select({ slug: organizations.slug }).from(organizations).where(eq(organizations.id, router.orgId)).limit(1);
    if (org) await revokeOpenvpnPeer(`${org.slug}-${router.name}`).catch(() => {});
  }
  const token = randomUUID();
  await db
    .update(routers)
    .set({
      status: "pending",
      host: null,
      tunnelIp: null,
      wgPeerPublicKey: null,
      installTokenHash: hashToken(token),
      installTokenExpiresAt: new Date(Date.now() + INSTALL_TOKEN_TTL_MS),
    })
    .where(eq(routers.id, router.id));
  await db.update(routerReplacements).set({ status: "pending", error: null, cancelledAt: null }).where(eq(routerReplacements.id, replacement.id));
  const command = await createInstallCommand(router.id, token);
  revalidatePath("/admin/remote-access");
  return { success: true as const, replacementId: replacement.id, sourceRouterId: source?.id, ...command };
}

export async function cancelRouterReplacement(replacementId: string) {
  const session = await getSession();
  if (!session) return { error: "Non authentifié." };
  const db = getDb();
  const [replacement] = await db.select().from(routerReplacements).where(eq(routerReplacements.id, replacementId)).limit(1);
  if (!replacement || (replacement.orgId !== session.orgId && !isSuperAdmin(session.role))) return { error: "Reprise introuvable." };
  if (!(replacement.status === "pending" || replacement.status === "installing" || replacement.status === "failed")) {
    return { error: "Cette reprise est déjà terminée." };
  }
  if (replacement.status === "installing") {
    return { error: "La connexion est en cours. Réessayez après quelques secondes." };
  }

  const [replacementRouter] = await db
    .select()
    .from(routers)
    .where(eq(routers.id, replacement.replacementRouterId))
    .limit(1);
  if (replacementRouter?.wgPeerPublicKey) {
    await revokeVpnPeer(replacementRouter.wgPeerPublicKey).catch(() => {});
  }
  if (replacementRouter?.connectionMethod === "openvpn") {
    const [org] = await db
      .select({ slug: organizations.slug })
      .from(organizations)
      .where(eq(organizations.id, replacementRouter.orgId))
      .limit(1);
    if (org) await revokeOpenvpnPeer(`${org.slug}-${replacementRouter.name}`).catch(() => {});
  }
  await db.update(routerReplacements).set({ status: "cancelled", cancelledAt: new Date() }).where(and(eq(routerReplacements.id, replacement.id), inArray(routerReplacements.status, ["pending", "installing", "failed"])));
  await db
    .update(routers)
    .set({
      status: "offline",
      host: null,
      tunnelIp: null,
      wgPeerPublicKey: null,
      installTokenHash: null,
      installTokenExpiresAt: null,
    })
    .where(eq(routers.id, replacement.replacementRouterId));
  await db.insert(vpnAccessAuditEvents).values({
    actorUserId: session.userId,
    orgId: replacement.orgId,
    routerId: replacement.sourceRouterId,
    replacementId: replacement.id,
    action: "replacement_cancelled",
  });
  revalidatePath("/admin/remote-access");
  return { success: true as const };
}
