import { eq, desc, inArray } from "drizzle-orm";
import { after } from "next/server";
import { Wifi } from "lucide-react";
import { getDb } from "@/lib/db";
import { routers, routerPortForwards } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import RemoteAccessTabs from "./RemoteAccessTabs";
import RemoteAccessSidebar from "./RemoteAccessSidebar";
import PersonalAccessSection from "./PersonalAccessSection";
import BackToHomeSection from "./BackToHomeSection";
import DirectAccessSection from "./DirectAccessSection";
import { listPersonalVpnAccess } from "@/lib/mikrotik/personal-access";
import { refreshStaleRouters } from "@/lib/mikrotik/router-sync";
import { getVpnTrialStatus } from "@/lib/billing/actions";

function methodLabel(method: string) {
  if (method === "vpn") return "WireGuard";
  if (method === "openvpn") return "OpenVPN";
  return "Direct";
}

export default async function RemoteAccessPage() {
  const session = await getSession();
  const db = getDb();

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

  const personalAccessRows = await listPersonalVpnAccess();
  const vpnTrial = session ? await getVpnTrialStatus() : null;

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
  const personalAccessCount = personalAccessRows.filter(
    (r) => r.status === "active",
  ).length;
  const activeForwardsCount = forwards.filter((f) => f.status === "active").length;

  return (
    <div className="animate-fade-in-up">
      {/* Page header */}
      <div className="mb-8">
        <div className="flex items-center gap-2">
          <Wifi aria-hidden="true" className="h-5 w-5 text-slate-700" />
          <h1 className="text-2xl font-bold text-slate-900">Accès distant</h1>
        </div>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">
          Gérez les tunnels d&apos;accès distant sécurisé (WireGuard ou OpenVPN) qui
          permettent à SafeLinkHub de joindre vos routeurs MikroTik sans IP publique ni
          redirection de port.
        </p>
      </div>

      {/* Mobile-only router status strip (sidebar handles desktop) */}
      {allRouters.length > 0 && (
        <div className="mb-6 lg:hidden">
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="table-mobile-wrapper">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-100 text-xs font-medium text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Routeur</th>
                    <th className="px-4 py-3">Méthode</th>
                    <th className="px-4 py-3">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {allRouters.map((r) => (
                    <tr key={r.id} className="border-b border-slate-50 last:border-0">
                      <td className="px-4 py-3 font-medium text-slate-700">{r.name}</td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                          {methodLabel(r.connectionMethod)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`flex items-center gap-1.5 text-sm font-medium ${
                            r.status === "online" ? "text-emerald-600" : "text-slate-500"
                          }`}
                        >
                          <span
                            aria-hidden="true"
                            className={`h-2 w-2 rounded-full ${
                              r.status === "online" ? "bg-emerald-500" : "bg-slate-300"
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
          personalAccessCount={personalAccessCount}
          activeForwardsCount={activeForwardsCount}
        />

        {/* Main content — each section gets an id for anchor + scroll-mt */}
        <div className="space-y-10">
          <section id="section-tunnel" className="scroll-mt-4">
            <RemoteAccessTabs />
          </section>

          <section id="section-vpn-perso" className="scroll-mt-4">
            <PersonalAccessSection
              rows={personalAccessRows}
              reachableRouters={allRouters
                .filter((r) => r.tunnelIp)
                .map((r) => ({
                  name: r.name,
                  tunnelIp: r.tunnelIp!,
                  method: r.connectionMethod,
                  status: r.status,
                }))}
            />
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
              }))}
              forwardsByRouter={forwardsByRouter}
              relayHost={process.env.WG_RELAY_HOST ?? ""}
              vpnTrial={vpnTrial}
            />
          </section>

        </div>
      </div>
    </div>
  );
}
