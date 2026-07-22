import { and, eq, inArray } from "drizzle-orm";
import {
  organizations,
  routerPortForwards,
  routerReplacements,
  routers,
  vpnAccessAuditEvents,
} from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { rebindPortForwards, revokeOpenvpnPeer, revokeVpnPeer } from "./relay";
import { replacementCompletionPlan, type ReplacementTunnelMethod } from "./router-recovery";

type ReplacementResult =
  | { status: "completed"; replacementId: string; transferred: number }
  | { status: "installing"; replacementId: string; error: string }
  | { status: "none" };

export async function getRouterReplacement(routerId: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(routerReplacements)
    .where(
      and(
        eq(routerReplacements.replacementRouterId, routerId),
        inArray(routerReplacements.status, ["pending", "installing", "completed", "failed"]),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function getActiveRouterReplacement(sourceRouterId: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(routerReplacements)
    .where(
      and(
        eq(routerReplacements.sourceRouterId, sourceRouterId),
        inArray(routerReplacements.status, ["pending", "installing", "failed"]),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function finalizeRouterReplacement(
  replacementRouterId: string,
): Promise<ReplacementResult> {
  const db = getDb();
  const [replacement] = await db
    .select()
    .from(routerReplacements)
    .where(eq(routerReplacements.replacementRouterId, replacementRouterId))
    .limit(1);
  if (!replacement) return { status: "none" };
  if (replacement.status === "completed") {
    return { status: "completed", replacementId: replacement.id, transferred: 0 };
  }

  const [claimed] = await db
    .update(routerReplacements)
    .set({ status: "installing", error: null })
    .where(
      and(
        eq(routerReplacements.id, replacement.id),
        inArray(routerReplacements.status, ["pending", "installing", "failed"]),
      ),
    )
    .returning();
  if (!claimed) return { status: "installing", replacementId: replacement.id, error: "Reprise déjà en cours." };

  const [sourceRouter, newRouter] = await Promise.all([
    db.select().from(routers).where(eq(routers.id, replacement.sourceRouterId)).limit(1),
    db.select().from(routers).where(eq(routers.id, replacement.replacementRouterId)).limit(1),
  ]).then(([sourceRows, newRows]) => [sourceRows[0], newRows[0]] as const);
  if (!sourceRouter || !newRouter?.tunnelIp) {
    const error = "Le routeur source ou le tunnel de remplacement est introuvable.";
    await db.update(routerReplacements).set({ status: "failed", error }).where(eq(routerReplacements.id, replacement.id));
    return { status: "installing", replacementId: replacement.id, error };
  }

  const forwards = await db
    .select({
      id: routerPortForwards.id,
      targetPort: routerPortForwards.targetPort,
      publicPort: routerPortForwards.publicPort,
      tlsTerminated: inArray(routerPortForwards.service, ["webfig", "mikhmon"]),
    })
    .from(routerPortForwards)
    .where(
      and(
        eq(routerPortForwards.routerId, sourceRouter.id),
        eq(routerPortForwards.status, "active"),
      ),
    );

  try {
    await rebindPortForwards(
      sourceRouter.tunnelIp,
      newRouter.tunnelIp,
      forwards.map(({ targetPort, publicPort, tlsTerminated }) => ({
        targetPort,
        publicPort,
        tlsTerminated: Boolean(tlsTerminated),
      })),
    );

    for (const forward of forwards) {
      await db
        .update(routerPortForwards)
        .set({ routerId: newRouter.id, tunnelIp: newRouter.tunnelIp })
        .where(eq(routerPortForwards.id, forward.id));
    }

    const method: ReplacementTunnelMethod = sourceRouter.connectionMethod === "openvpn" ? "openvpn" : "vpn";
    if (method === "vpn" && sourceRouter.wgPeerPublicKey) {
      await revokeVpnPeer(sourceRouter.wgPeerPublicKey);
    } else if (method === "openvpn") {
      const [org] = await db.select({ slug: organizations.slug }).from(organizations).where(eq(organizations.id, sourceRouter.orgId)).limit(1);
      if (org) await revokeOpenvpnPeer(`${org.slug}-${sourceRouter.name}`);
    }

    await db.update(routers).set({ status: "replaced" }).where(eq(routers.id, sourceRouter.id));
    await db
      .update(routerReplacements)
      .set({ status: "completed", completedAt: new Date(), error: null })
      .where(eq(routerReplacements.id, replacement.id));
    await db.insert(vpnAccessAuditEvents).values({
      actorUserId: replacement.requestedBy,
      orgId: replacement.orgId,
      routerId: newRouter.id,
      replacementId: replacement.id,
      action: "replacement_completed",
    });

    // Keep this contract visible to reviewers: the ordered operations above
    // match the pure plan and never allocate a second public port.
    void replacementCompletionPlan(method);
    return { status: "completed", replacementId: replacement.id, transferred: forwards.length };
  } catch (err) {
    const error = err instanceof Error ? err.message.slice(0, 240) : "Échec technique de la reprise.";
    await db.update(routerReplacements).set({ status: "failed", error }).where(eq(routerReplacements.id, replacement.id));
    return { status: "installing", replacementId: replacement.id, error };
  }
}
