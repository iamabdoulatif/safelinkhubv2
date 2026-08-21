import { and, desc, eq, inArray } from "drizzle-orm";
import { after } from "next/server";
import { getSession, isSuperAdmin } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import {
  routerMikhmonCloudInstances,
  routerPortForwards,
  routers,
  vpnAccessAuditEvents,
} from "@/lib/db/schema";
import { refreshStaleRouters } from "@/lib/mikrotik/router-sync";
import { getActiveRouterReplacement } from "@/lib/mikrotik/router-recovery-service";
import { getRelayPublicHost } from "@/lib/mikrotik/relay";
import { listActiveGrantsForOrg } from "@/lib/remote-access/grants";
import { buildControlCenterRouters } from "@/lib/remote-access/control-center";
import RemoteAccessControlCenter from "./RemoteAccessControlCenter";

type ForwardRow = typeof routerPortForwards.$inferSelect;
type AuditRow = {
  id: string;
  routerId: string;
  action: string;
  createdAt: Date;
};

export default async function RemoteAccessPage() {
  const session = await getSession();
  const db = getDb();
  const superadmin = isSuperAdmin(session?.role);

  if (session) {
    after(() => refreshStaleRouters(session.orgId));
  }

  const allRouters = session
    ? await db
        .select()
        .from(routers)
        .where(eq(routers.orgId, session.orgId))
        .orderBy(desc(routers.createdAt))
    : [];

  const activeGrants = !superadmin && session
    ? await listActiveGrantsForOrg(session.orgId)
    : [];

  const routerIds = allRouters.map((router) => router.id);
  let forwards: ForwardRow[] = [];
  let cloudInstances: { routerId: string; domain: string }[] = [];
  let auditRows: AuditRow[] = [];
  if (routerIds.length) {
    [forwards, cloudInstances, auditRows] = await Promise.all([
      db
        .select()
        .from(routerPortForwards)
        .where(inArray(routerPortForwards.routerId, routerIds)),
      db
        .select({ routerId: routerMikhmonCloudInstances.routerId, domain: routerMikhmonCloudInstances.domain })
        .from(routerMikhmonCloudInstances)
        .where(
          and(
            inArray(routerMikhmonCloudInstances.routerId, routerIds),
            eq(routerMikhmonCloudInstances.status, "active"),
          ),
        ),
      db
        .select({
          id: vpnAccessAuditEvents.id,
          routerId: vpnAccessAuditEvents.routerId,
          action: vpnAccessAuditEvents.action,
          createdAt: vpnAccessAuditEvents.createdAt,
        })
        .from(vpnAccessAuditEvents)
        .where(inArray(vpnAccessAuditEvents.routerId, routerIds))
        .orderBy(desc(vpnAccessAuditEvents.createdAt)),
    ]);
  }

  const forwardsByRouter: Record<string, typeof forwards> = {};
  for (const forward of forwards) {
    (forwardsByRouter[forward.routerId] ??= []).push(forward);
  }

  const auditByRouter: Record<string, typeof auditRows> = {};
  for (const event of auditRows) {
    const events = auditByRouter[event.routerId] ?? [];
    if (events.length < 3) events.push(event);
    auditByRouter[event.routerId] = events;
  }

  const replacementEntries = await Promise.all(
    allRouters.map(async (router) => [
      router.id,
      (await getActiveRouterReplacement(router.id))?.status ?? null,
    ] as const),
  );
  const replacementByRouter = Object.fromEntries(replacementEntries);
  const cloudDomainsByRouter = Object.fromEntries(
    cloudInstances.map((instance) => [instance.routerId, instance.domain]),
  );
  const controlRouters = buildControlCenterRouters({
    routers: allRouters,
    forwardsByRouter,
    auditsByRouter: auditByRouter,
    replacementByRouter,
    getRelayHost: getRelayPublicHost,
    cloudDomainsByRouter,
  });
  const temporaryPassExpiresAt = activeGrants.length
    ? activeGrants.reduce((earliest, grant) => grant.expiresAt < earliest ? grant.expiresAt : earliest, activeGrants[0].expiresAt).toISOString()
    : null;

  return (
    <RemoteAccessControlCenter
      routers={controlRouters}
      temporaryPassCount={activeGrants.length}
      temporaryPassExpiresAt={temporaryPassExpiresAt}
    />
  );
}
