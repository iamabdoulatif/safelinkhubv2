import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { after } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getVpnTrialStatus } from "@/lib/billing/actions";
import { getDb } from "@/lib/db";
import { routerPortForwards, routers } from "@/lib/db/schema";
import { getRelayPublicHost } from "@/lib/mikrotik/relay";
import { getActiveRouterReplacement } from "@/lib/mikrotik/router-recovery-service";
import { refreshStaleRouters } from "@/lib/mikrotik/router-sync";
import BackToHomeSection from "../BackToHomeSection";
import DirectAccessSection from "../DirectAccessSection";
import Ipv6BypassSection from "../Ipv6BypassSection";
import RouterReplacementSection from "../RouterReplacementSection";

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

  const [forwards, vpnTrial, replacement] = await Promise.all([
    db
      .select()
      .from(routerPortForwards)
      .where(and(eq(routerPortForwards.routerId, router.id), eq(routerPortForwards.status, "active"))),
    getVpnTrialStatus(),
    getActiveRouterReplacement(router.id),
  ]);
  const relayHost = getRelayPublicHost(router.relayShard);
  const canReplace =
    (router.connectionMethod === "vpn" || router.connectionMethod === "openvpn") &&
    Boolean(router.tunnelIp);

  return (
    <div className="animate-fade-in-up space-y-8">
      <Link
        href="/admin/remote-access"
        className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-ink-soft hover:text-ink"
      >
        ← Retour au centre de contrôle
      </Link>

      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-brand-deep">
          Espace routeur
        </p>
        <h1 className="mt-1 text-2xl font-bold text-ink">{router.name}</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Actions techniques et accès distants de ce MikroTik.
        </p>
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
        forwardsByRouter={{ [router.id]: forwards }}
        relayHost={relayHost}
        relayBaseDomain={process.env.RELAY_BASE_DOMAIN ?? null}
        vpnTrial={vpnTrial}
      />

      <BackToHomeSection routers={[{ id: router.id, name: router.name, status: router.status }]} />

      <Ipv6BypassSection
        routers={[
          {
            id: router.id,
            name: router.name,
            status: router.status,
            connectionMethod: router.connectionMethod,
            ipv6BypassEnabled: router.ipv6BypassEnabled,
          },
        ]}
        relayHost={relayHost}
      />

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
  );
}
