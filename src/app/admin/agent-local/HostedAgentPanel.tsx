import Link from "next/link";
import { Cloud, ExternalLink, RadioTower } from "lucide-react";
import { hostedAgentTransportLabel } from "@/lib/mikrotik/hosted-agent";

type HostedRouter = {
  id: string;
  name: string;
  model: string | null;
  connectionMethod: string | null;
  tunnelIp: string | null;
};

export default function HostedAgentPanel({ routers }: { routers: HostedRouter[] }) {
  return (
    <section className="mt-8 rounded-2xl border border-brand-deep/40 bg-brand/20 p-5">
      <div className="flex items-start gap-3">
        <Cloud aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-ink" />
        <div>
          <h2 className="text-base font-semibold text-ink">Agent hébergé sur le SaaS</h2>
          <p className="mt-1 max-w-3xl text-sm text-ink-soft">
            Pour les routeurs déjà en ligne par WireGuard, OpenVPN ou SSTP, le VPS exécute le
            diagnostic et les actions autorisées à travers le tunnel. Aucun logiciel n&apos;est à
            installer sur votre ordinateur.
          </p>
        </div>
      </div>

      {routers.length === 0 ? (
        <p className="mt-4 rounded-xl border border-line bg-white/70 px-4 py-3 text-sm text-ink-soft">
          Aucun routeur tunnel en ligne pour cette organisation. Utilisez l&apos;agent local pour
          mettre un routeur sur pied, puis son accès hébergé apparaîtra ici après la connexion VPN.
        </p>
      ) : (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {routers.map((router) => (
            <div key={router.id} className="rounded-xl border border-line bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-ink">{router.name}</p>
                  <p className="mt-0.5 text-xs text-ink-soft">
                    {[router.model, hostedAgentTransportLabel(router.connectionMethod), router.tunnelIp]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <RadioTower aria-hidden="true" className="h-4 w-4 text-ok" />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href={`/admin/router/${router.id}?tab=diagnostic`}
                  className="inline-flex items-center gap-1.5 rounded-full bg-ink px-3 py-2 text-xs font-semibold text-white"
                >
                  <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
                  Ouvrir le diagnostic hébergé
                </Link>
                <Link
                  href={`/admin/router/${router.id}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-2 text-xs font-semibold text-ink hover:bg-clay"
                >
                  Voir le routeur
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
