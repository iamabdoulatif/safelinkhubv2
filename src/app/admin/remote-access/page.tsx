import { eq, desc, inArray } from "drizzle-orm";
import { after } from "next/server";
import { Wifi } from "lucide-react";
import { getDb } from "@/lib/db";
import { routers, routerPortForwards } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import RemoteAccessTabs from "./RemoteAccessTabs";
import PersonalAccessSection from "./PersonalAccessSection";
import BackToHomeSection from "./BackToHomeSection";
import DirectAccessSection from "./DirectAccessSection";
import MndpRelaySection from "./MndpRelaySection";
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

  return (
    <div className="mx-auto max-w-3xl animate-fade-in-up">
      <div className="flex items-center gap-2">
        <Wifi className="h-5 w-5 text-slate-700" />
        <h1 className="text-2xl font-bold text-slate-900">Accès distant</h1>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Gérez les tunnels d&apos;accès distant sécurisé (WireGuard ou OpenVPN) qui
        permettent à SafeLinkHub de joindre vos routeurs MikroTik sans IP
        publique ni redirection de port.
      </p>

      {allRouters.length > 0 && (
        <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
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
                        className={`h-2 w-2 rounded-full ${
                          r.status === "online" ? "bg-emerald-500" : "bg-slate-300"
                        }`}
                      />
                      {r.status === "online"
                        ? "En ligne"
                        : r.status === "installing" || r.status === "pending"
                          ? "En attente de connexion"
                          : "Hors ligne"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      <RemoteAccessTabs />
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
      <BackToHomeSection
        routers={allRouters.map((r) => ({ id: r.id, name: r.name, status: r.status }))}
      />
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
      {session && <MndpRelaySection orgId={session.orgId} />}
    </div>
  );
}
