"use server";

import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  organizations,
  remoteAccessAuthorizations,
  routerPortForwards,
  routers,
  vpnAccessAuditEvents,
} from "@/lib/db/schema";
import { getSession, isSuperAdmin } from "@/lib/auth/session";
import { decryptSecret } from "./crypto";

export type VpnAccessInventoryRow = {
  id: string;
  orgId: string;
  orgName: string;
  orgSlug: string;
  routerId: string;
  routerName: string;
  routerStatus: string;
  connectionMethod: string;
  tunnelIp: string | null;
  username: string | null;
  service: string;
  publicPort: number;
  billingPeriod: string;
  expiresAt: Date | null;
  purchasedAt: Date | null;
  payerName: string | null;
  payerEmail: string | null;
};

function requireSuperadmin() {
  return getSession().then((session) => {
    if (!isSuperAdmin(session?.role)) return null;
    return session;
  });
}

/** Inventory safe for the UI: no encrypted credential or secret is selected. */
export async function listVpnAccessInventory(): Promise<VpnAccessInventoryRow[]> {
  const session = await requireSuperadmin();
  if (!session) return [];

  const db = getDb();
  const [forwards, authorizations] = await Promise.all([
    db
      .select({ forward: routerPortForwards, router: routers, org: organizations })
      .from(routerPortForwards)
      .innerJoin(routers, eq(routerPortForwards.routerId, routers.id))
      .innerJoin(organizations, eq(routers.orgId, organizations.id))
      .where(eq(routerPortForwards.status, "active"))
      .orderBy(desc(routerPortForwards.createdAt)),
    db
      .select()
      .from(remoteAccessAuthorizations)
      .where(eq(remoteAccessAuthorizations.status, "approved"))
      .orderBy(desc(remoteAccessAuthorizations.createdAt)),
  ]);

  const latestPayment = new Map<string, (typeof authorizations)[number]>();
  for (const authorization of authorizations) {
    const key = `${authorization.routerId ?? ""}:${authorization.service}`;
    if (!latestPayment.has(key)) latestPayment.set(key, authorization);
  }

  return forwards.map(({ forward, router, org }) => {
    const payment = latestPayment.get(`${router.id}:${forward.service}`);
    return {
      id: forward.id,
      orgId: org.id,
      orgName: org.name,
      orgSlug: org.slug,
      routerId: router.id,
      routerName: router.name,
      routerStatus: router.status,
      connectionMethod: router.connectionMethod,
      tunnelIp: router.tunnelIp,
      username: router.username,
      service: forward.service,
      publicPort: forward.publicPort,
      billingPeriod: forward.billingPeriod,
      expiresAt: forward.expiresAt,
      purchasedAt: payment?.decidedAt ?? payment?.createdAt ?? forward.createdAt,
      payerName: payment?.requesterName ?? null,
      payerEmail: payment?.requesterEmail ?? null,
    };
  });
}

export async function revealVpnCredentials(routerId: string) {
  const session = await requireSuperadmin();
  if (!session) return { error: "Accès réservé au superadmin." };

  const db = getDb();
  const [router] = await db
    .select({
      id: routers.id,
      orgId: routers.orgId,
      name: routers.name,
      username: routers.username,
      passwordEncrypted: routers.passwordEncrypted,
    })
    .from(routers)
    .where(eq(routers.id, routerId))
    .limit(1);
  if (!router) return { error: "Routeur introuvable." };

  let password: string | null = null;
  try {
    password = router.passwordEncrypted ? decryptSecret(router.passwordEncrypted) : null;
  } catch {
    return { error: "Le mot de passe chiffré est illisible avec la clé actuelle." };
  }

  await db.insert(vpnAccessAuditEvents).values({
    actorUserId: session.userId,
    orgId: router.orgId,
    routerId: router.id,
    action: "credentials_revealed",
  });

  return { success: true as const, routerName: router.name, username: router.username, password };
}

export async function recordVpnAccessAudit(
  routerId: string,
  action: "copied" | "whatsapp_prepared",
) {
  const session = await requireSuperadmin();
  if (!session) return { error: "Accès réservé au superadmin." };
  const db = getDb();
  const [router] = await db
    .select({ id: routers.id, orgId: routers.orgId })
    .from(routers)
    .where(eq(routers.id, routerId))
    .limit(1);
  if (!router) return { error: "Routeur introuvable." };
  await db.insert(vpnAccessAuditEvents).values({
    actorUserId: session.userId,
    orgId: router.orgId,
    routerId: router.id,
    action,
  });
  return { success: true as const };
}
