import Link from "next/link";
import { ArrowUpRight, CircleAlert, Router, Users } from "lucide-react";
import type { ClientPortfolio } from "./router-portfolio";

type ClientPortfolioGridProps = {
  clients: ClientPortfolio[];
};

function pluralize(count: number, singular: string, plural: string) {
  return count === 1 ? singular : plural;
}

export function ClientPortfolioGrid({ clients }: ClientPortfolioGridProps) {
  if (clients.length === 0) {
    return (
      <section className="border border-line bg-paper p-6 text-ink rounded-xl" aria-labelledby="client-portfolios-empty-title">
        <CircleAlert className="h-6 w-6 text-brand-deep" aria-hidden="true" />
        <h2 id="client-portfolios-empty-title" className="mt-4 text-lg font-bold">
          Aucune organisation cliente disponible
        </h2>
        <p className="mt-2 max-w-prose text-sm leading-6 text-ink-soft">
          Les organisations clientes avec des membres ou des routeurs apparaîtront ici.
        </p>
      </section>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {clients.map((client) => {
        const { routerCounts } = client;
        const organizationTitleId = `client-portfolio-${client.id}`;

        return (
          <article key={client.id} className="flex h-full flex-col border border-line bg-paper p-5 rounded-xl" aria-labelledby={organizationTitleId}>
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center border border-line bg-brand text-slate-deep" aria-hidden="true">
                <Router className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">Organisation cliente</p>
                <h2 id={organizationTitleId} className="mt-1 break-words text-lg font-bold text-ink">
                  {client.name}
                </h2>
              </div>
            </div>

            <dl className="mt-5 grid grid-cols-2 gap-3 border-y border-line py-4 text-sm">
              <div>
                <dt className="flex items-center gap-1.5 font-medium text-ink-soft">
                  <Users className="h-4 w-4" aria-hidden="true" />
                  Utilisateurs
                </dt>
                <dd className="mt-1 font-bold text-ink">
                  {client.memberCount} {pluralize(client.memberCount, "membre", "membres")}
                </dd>
              </div>
              <div>
                <dt className="flex items-center gap-1.5 font-medium text-ink-soft">
                  <Router className="h-4 w-4" aria-hidden="true" />
                  Routeurs
                </dt>
                <dd className="mt-1 font-bold text-ink">
                  {routerCounts.total} {pluralize(routerCounts.total, "routeur", "routeurs")}
                </dd>
              </div>
            </dl>

            <section className="mt-4" aria-label={`État des routeurs de ${client.name}`}>
              <h3 className="text-xs font-bold uppercase tracking-wide text-ink-soft">État des routeurs</h3>
              <ul className="mt-2 grid grid-cols-3 gap-2 text-xs text-ink">
                <li className="border border-ok bg-ok/10 px-2 py-2 text-ink">En ligne : {routerCounts.online}</li>
                <li className="border border-warn bg-warn/10 px-2 py-2 text-ink">En configuration : {routerCounts.configuring}</li>
                <li className="border border-err bg-err/10 px-2 py-2 text-ink">Hors ligne : {routerCounts.offline}</li>
              </ul>
            </section>

            <div className="mt-5 flex flex-wrap gap-2">
              <Link
                href={`/admin/users?org=${client.id}`}
                aria-label={`Ouvrir l’organisation ${client.name}`}
                className="inline-flex items-center gap-1.5 border border-line bg-paper px-3 py-2 text-sm font-bold text-ink transition-colors duration-150 hover:bg-clay focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink rounded-xl"
              >
                Ouvrir l’organisation
                <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link
                href={`/admin/router?scope=clients&org=${client.id}`}
                aria-label={`Voir les routeurs de ${client.name}`}
                className="inline-flex items-center gap-1.5 border border-line bg-brand px-3 py-2 text-sm font-bold text-slate-deep transition-colors duration-150 hover:bg-ink hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink rounded-full"
              >
                Voir les routeurs
                <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </article>
        );
      })}
    </div>
  );
}
