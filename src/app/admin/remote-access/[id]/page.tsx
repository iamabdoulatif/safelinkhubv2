import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import RouterThumb from "@/components/RouterThumb";
import { and, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { after } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getVpnTrialStatus } from "@/lib/billing/actions";
import { getDb } from "@/lib/db";
import { routerMikhmonCloudInstances, routerPortForwards, routers } from "@/lib/db/schema";
import { getRelayPublicHost } from "@/lib/mikrotik/relay";
import { getActiveRouterReplacement } from "@/lib/mikrotik/router-recovery-service";
import { refreshStaleRouters } from "@/lib/mikrotik/router-sync";
import BackToHomeSection from "../BackToHomeSection";
import DirectAccessSection from "../DirectAccessSection";
import RouterReplacementSection from "../RouterReplacementSection";
import { tunnelLabel } from "@/lib/mikrotik/tunnel-methods";

type PageProps = { params: Promise<{ id: string }> };

export default async function RouterRemoteAccessWorkspace({ params }: PageProps) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect("/auth/login?callback=/admin/remote-access");

  const db = getDb();
  const [router] = await db
    .select()
    .from(routers)
    .where(and(eq(routers.id, id), eq(routers.orgId, session.orgId)))
    .limit(1);
  if (!router) notFound();

  after(() => refreshStaleRouters(session.orgId));

  const [forwards, cloudInstance, vpnTrial, replacement] = await Promise.all([
    db
      .select()
      .from(routerPortForwards)
      .where(and(eq(routerPortForwards.routerId, router.id), eq(routerPortForwards.status, "active"))),
    db
      .select({ domain: routerMikhmonCloudInstances.domain, localPort: routerMikhmonCloudInstances.localPort })
      .from(routerMikhmonCloudInstances)
      .where(and(eq(routerMikhmonCloudInstances.routerId, router.id), eq(routerMikhmonCloudInstances.status, "active")))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    getVpnTrialStatus(),
    getActiveRouterReplacement(router.id),
  ]);
  const relayHost = getRelayPublicHost(router.relayShard);
  const canReplace =
    (router.connectionMethod === "vpn" || router.connectionMethod === "openvpn") &&
    Boolean(router.tunnelIp);

  const online = router.status === "online";
  const methodLabel = tunnelLabel(router.connectionMethod);

  return (
    <div className="animate-fade-in-up space-y-8">
      <Link
        href="/admin/remote-access"
        className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-ink-soft hover:text-ink"
      >
        <ArrowLeft aria-hidden="true" className="h-4 w-4" />
        Centre de contrôle
      </Link>

      {/* En-tête : QUEL routeur, dans QUEL état, joignable par OÙ. Le nom
          n'est écrit qu'ici — les sections dessous parlent de « ce routeur ». */}
      <header className="flex items-center gap-4 sm:gap-5">
        <RouterThumb model={router.model} size={60} className="rounded-2xl" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="truncate text-2xl font-semibold tracking-tight text-ink">{router.name}</h1>
            <span
              className={`inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold ${
                online ? "bg-ok-soft text-ok" : "bg-err-soft text-err"
              }`}
            >
              <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${online ? "bg-ok live-dot" : "bg-err live-dot live-dot-alert"}`} />
              {online ? "En ligne" : "Hors ligne"}
            </span>
          </div>
          <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-soft">
            {router.model && (
              <div>
                <dt className="sr-only">Modèle</dt>
                <dd>{router.model}</dd>
              </div>
            )}
            <div className="flex gap-1.5">
              <dt>Tunnel</dt>
              <dd className="font-mono text-ink">
                {methodLabel}
                {router.tunnelIp ? ` · ${router.tunnelIp}` : ""}
              </dd>
            </div>
            <div className="flex gap-1.5">
              <dt>Relais</dt>
              <dd className="font-mono text-ink">{relayHost}</dd>
            </div>
          </dl>
        </div>
      </header>

      <DirectAccessSection
        routers={[
          {
            id: router.id,
            name: router.name,
            status: router.status,
            connectionMethod: router.connectionMethod,
            tunnelIp: router.tunnelIp,
            username: router.username,
            relayHost,
          },
        ]}
        forwardsByRouter={{
          [router.id]: forwards.map((forward) => ({
            ...forward,
            cloudDomain:
              forward.service === "mikhmon" && forward.targetPort === cloudInstance?.localPort
                ? cloudInstance.domain
                : null,
          })),
        }}
        relayHost={relayHost}
        relayBaseDomain={process.env.RELAY_BASE_DOMAIN ?? null}
        vpnTrial={vpnTrial}
      />

      {/* Outils ponctuels : côte à côte, ils ne concurrencent plus les accès. */}
      <section aria-labelledby="outils-routeur" className="space-y-3">
        <h2 id="outils-routeur" className="text-sm font-semibold text-ink">
          Autres outils
        </h2>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <BackToHomeSection routers={[{ id: router.id, name: router.name, status: router.status }]} />
          {canReplace && (
            <RouterReplacementSection
              rows={[
                {
                  router: {
                    id: router.id,
                    name: router.name,
                    status: router.status,
                    connectionMethod: router.connectionMethod,
                    tunnelIp: router.tunnelIp,
                  },
                  services: forwards.map((forward) => ({
                    service: forward.service,
                    publicPort: forward.publicPort,
                  })),
                  replacement,
                },
              ]}
            />
          )}
        </div>
      </section>
    </div>
  );
}
