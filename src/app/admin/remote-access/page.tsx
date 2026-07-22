import { eq, desc, inArray } from "drizzle-orm";
import { after } from "next/server";
import { Wifi } from "lucide-react";
import { getDb } from "@/lib/db";
import { organizations, routers, routerPortForwards } from "@/lib/db/schema";
import { getSession, isSuperAdmin } from "@/lib/auth/session";
import RemoteAccessTabs from "./RemoteAccessTabs";
import RemoteAccessSidebar from "./RemoteAccessSidebar";
import BackToHomeSection from "./BackToHomeSection";
import DirectAccessSection from "./DirectAccessSection";
import Ipv6BypassSection from "./Ipv6BypassSection";
import RouterReplacementSection from "./RouterReplacementSection";
import { getRelayPublicHost } from "@/lib/mikrotik/relay";
import { refreshStaleRouters } from "@/lib/mikrotik/router-sync";
import { getVpnTrialStatus } from "@/lib/billing/actions";
import { getActiveRouterReplacement } from "@/lib/mikrotik/router-recovery-service";
import {
  listActiveGrantsForOrg,
  listAllRemoteAccessGrants,
} from "@/lib/remote-access/grants";
import TemporaryAccessPasses from "./TemporaryAccessPasses";

function methodLabel(method: string) {
  if (method === "vpn") return "WireGuard";
  if (method === "openvpn") return "OpenVPN";
  return "Direct";
}

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

  const vpnTrial = session ? await getVpnTrialStatus() : null;

  // The grant console is intentionally superadmin-only. Regular admins only
  // receive a read-only summary of passes currently covering their org.
  const grantOrganizations = superadmin
    ? await db
        .select({ id: organizations.id, name: organizations.name, slug: organizations.slug })
        .from(organizations)
        .orderBy(organizations.name)
    : [];
  const grantRouters = superadmin
    ? await db
        .select({ id: routers.id, name: routers.name, orgId: routers.orgId })
        .from(routers)
        .orderBy(routers.name)
    : [];
  const allGrants = superadmin ? await listAllRemoteAccessGrants() : [];
  const activeGrants = !superadmin && session
    ? await listActiveGrantsForOrg(session.orgId)
    : [];

  const routerIds = allRouters.map((r) => r.id);
  const forwards = routerIds.length
    ? await db
        .select()
        .from(routerPortForwards)
        .where(inArray(routerPortForwards.routerId, routerIds))
    : [];
  const forwardsByRouter: Record<string, typeof forwards> = {};
  for (const f of forwards) {
    (forwardsByRouter[f.routerId] ??= []).push(f);
  }

  // Badge counts for sidebar
  const tunnelCount = allRouters.filter(
    (r) => r.connectionMethod === "vpn" || r.connectionMethod === "openvpn",
  ).length;
  const activeForwardsCount = forwards.filter((f) => f.status === "active").length;
  const ipv6BypassCount = allRouters.filter((r) => r.ipv6BypassEnabled).length;
  const replacementRows = await Promise.all(
    allRouters
      .filter(
        (router) =>
          (router.connectionMethod === "vpn" || router.connectionMethod === "openvpn") &&
          router.status !== "replaced" &&
          Boolean(router.tunnelIp),
      )
      .map(async (router) => ({
        router: {
          id: router.id,
          name: router.name,
          status: router.status,
          connectionMethod: router.connectionMethod,
          tunnelIp: router.tunnelIp,
        },
        services: (forwardsByRouter[router.id] ?? [])
          .filter((forward) => forward.status === "active")
          .map((forward) => ({ service: forward.service, publicPort: forward.publicPort })),
        replacement: await getActiveRouterReplacement(router.id),
      })),
  );

  return (
    <div className="animate-fade-in-up">
      {/* Page header */}
      <div className="mb-8">
        <div className="flex items-center gap-2">
          <Wifi aria-hidden="true" className="h-5 w-5 text-ink" />
          <h1 className="text-2xl font-bold text-ink">Accès distant</h1>
        </div>
        <p className="mt-1 max-w-2xl text-sm text-ink-soft">
          Gérez les tunnels d&apos;accès distant sécurisé (WireGuard ou OpenVPN) qui
          permettent à SafeLinkHub de joindre vos routeurs MikroTik sans IP publique ni
          redirection de port.
        </p>
      </div>

      {superadmin ? (
        <div className="mb-8">
          <TemporaryAccessPasses
            organizations={grantOrganizations}
            routers={grantRouters}
            grants={allGrants}
          />
        </div>
      ) : activeGrants.length > 0 ? (
        <section className="mb-8 border-2 border-line bg-paper p-5 shadow-[4px_4px_0_var(--line)] sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-deep">
                Accès offert
              </p>
              <h2 className="mt-1 text-lg font-semibold text-ink">Vos passes temporaires actifs</h2>
              <p className="mt-1 text-sm text-ink-soft">
                Ces accès sont gratuits : ils ne débitent pas votre portefeuille Safecoin.
              </p>
            </div>
            <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-semibold text-ok">
              {activeGrants.length} actif{activeGrants.length > 1 ? "s" : ""}
            </span>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {activeGrants.slice(0, 8).map((grant) => (
              <div key={grant.id} className="border border-line-soft px-3 py-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-ink">
                    {grant.routerId ? "Routeur ciblé" : "Tous vos routeurs"}
                  </span>
                  <span className="rounded-full bg-green-50 px-2 py-1 text-[11px] font-semibold text-ok">
                    Gratuit
                  </span>
                </div>
                <p className="mt-1 text-xs text-ink-soft">
                  {grant.services.length === 0 ? "Tous les services" : grant.services.join(" · ")} · expire le {new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(grant.expiresAt)}
                </p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Mobile-only router status strip (sidebar handles desktop) */}
      {allRouters.length > 0 && (
        <div className="mb-6 lg:hidden">
          <div className="overflow-hidden border-2 border-line bg-paper">
            <div className="table-mobile-wrapper">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-line-soft text-xs font-medium text-ink-soft">
                  <tr>
                    <th className="px-4 py-3">Routeur</th>
                    <th className="px-4 py-3">Méthode</th>
                    <th className="px-4 py-3">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {allRouters.map((r) => (
                    <tr key={r.id} className="border-b border-line-soft last:border-0">
                      <td className="px-4 py-3 font-medium text-ink">{r.name}</td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-clay px-2.5 py-1 text-xs font-medium text-ink-soft">
                          {methodLabel(r.connectionMethod)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`flex items-center gap-1.5 text-sm font-medium ${
                            r.status === "online" ? "text-ok" : "text-ink-soft"
                          }`}
                        >
                          <span
                            aria-hidden="true"
                            className={`h-2 w-2 rounded-full ${
                              r.status === "online" ? "bg-ok" : "bg-line-soft"
                            }`}
                          />
                          {r.status === "online"
                            ? "En ligne"
                            : r.status === "installing" || r.status === "pending"
                              ? "En attente"
                              : "Hors ligne"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Two-column layout: sticky sidebar + content */}
      <div className="lg:grid lg:grid-cols-[200px_1fr] lg:items-start lg:gap-10">
        <RemoteAccessSidebar
          routers={allRouters.map((r) => ({
            id: r.id,
            name: r.name,
            status: r.status,
          }))}
          tunnelCount={tunnelCount}
          activeForwardsCount={activeForwardsCount}
          ipv6BypassCount={ipv6BypassCount}
          replacementCount={replacementRows.length}
        />

        {/* Main content — each section gets an id for anchor + scroll-mt */}
        <div className="space-y-10">
          <section id="section-tunnel" className="scroll-mt-4">
            <RemoteAccessTabs />
          </section>

          <section id="section-back-to-home" className="scroll-mt-4">
            <BackToHomeSection
              routers={allRouters.map((r) => ({
                id: r.id,
                name: r.name,
                status: r.status,
              }))}
            />
          </section>

          <section id="section-direct-access" className="scroll-mt-4">
            <DirectAccessSection
              routers={allRouters.map((r) => ({
                id: r.id,
                name: r.name,
                status: r.status,
                connectionMethod: r.connectionMethod,
                tunnelIp: r.tunnelIp,
                username: r.username,
                relayHost: getRelayPublicHost(r.relayShard),
              }))}
              forwardsByRouter={forwardsByRouter}
              relayHost={getRelayPublicHost()}
              relayBaseDomain={process.env.RELAY_BASE_DOMAIN ?? null}
              vpnTrial={vpnTrial}
            />
          </section>

          <section id="section-ipv6-bypass" className="scroll-mt-4">
            <Ipv6BypassSection
              routers={allRouters.map((r) => ({
                id: r.id,
                name: r.name,
                status: r.status,
                connectionMethod: r.connectionMethod,
                ipv6BypassEnabled: r.ipv6BypassEnabled,
              }))}
              relayHost={getRelayPublicHost()}
            />
          </section>

          <section id="section-replacement" className="scroll-mt-4">
            <RouterReplacementSection rows={replacementRows} />
          </section>

        </div>
      </div>
    </div>
  );
}
