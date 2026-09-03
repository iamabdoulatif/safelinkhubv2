import Link from "next/link";
import { ArrowUpRight, CircleAlert, Router } from "lucide-react";
import type { ClientPortfolio } from "./router-portfolio";
import type { RouterDictionary } from "./RoutersTable";

type ClientPortfolioGridProps = {
  clients: ClientPortfolio[];
  t: RouterDictionary["clients"];
};

function pluralize(count: number, singular: string, plural: string) {
  return count === 1 ? singular : plural;
}

/** Une entrée de la légende sous la barre de santé : pastille + chiffre + libellé. */
function LegendItem({
  count,
  label,
  color,
  emphasize = false,
}: {
  count: number;
  label: string;
  color: string;
  emphasize?: boolean;
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${emphasize ? "text-err" : "text-ink-soft"}`}>
      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${color}`} />
      <b className={`tabular-nums font-bold ${emphasize ? "text-err" : "text-ink"}`}>{count}</b>
      {label}
    </span>
  );
}

/**
 * Grille « Parcs clients » — carte « Barre de santé ».
 *
 * Les trois anciens encadrés d'état sont fondus en UNE barre proportionnelle
 * (vert en ligne / ambre en configuration / rouge hors ligne) surmontant une
 * légende chiffrée : l'état du parc de l'organisation se lit d'un coup d'œil.
 * Le hors-ligne ne passe en rouge que s'il existe. Une organisation sans routeur
 * affiche un repère neutre à la place de la barre.
 */
export function ClientPortfolioGrid({ clients, t }: ClientPortfolioGridProps) {
  if (clients.length === 0) {
    return (
      <section className="border border-line bg-paper p-6 text-ink rounded-xl" aria-labelledby="client-portfolios-empty-title">
        <CircleAlert className="h-6 w-6 text-brand-deep" aria-hidden="true" />
        <h2 id="client-portfolios-empty-title" className="mt-4 text-lg font-bold">
          {t.emptyTitle}
        </h2>
        <p className="mt-2 max-w-prose text-sm leading-6 text-ink-soft">
          {t.emptyText}
        </p>
      </section>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {clients.map((client) => {
        const { routerCounts } = client;
        const total = routerCounts.total;
        const pct = (n: number) => (total > 0 ? `${(n / total) * 100}%` : "0%");
        const organizationTitleId = `client-portfolio-${client.id}`;
        const subtitle = `${client.memberCount} ${pluralize(client.memberCount, t.member, t.members)} · ${total} ${pluralize(total, t.router, t.routerPlural)}`;

        return (
          <article
            key={client.id}
            className="flex h-full flex-col gap-4 border border-line-soft bg-paper p-5 shadow-sm rounded-2xl"
            aria-labelledby={organizationTitleId}
          >
            {/* Identité */}
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand text-slate-deep" aria-hidden="true">
                <Router className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="font-mono text-[11px] font-semibold uppercase tracking-widest text-ink-soft">{t.organization}</p>
                <h2 id={organizationTitleId} className="mt-1 break-words text-lg font-bold leading-tight text-ink">
                  {client.name}
                </h2>
                <p className="mt-1 text-sm tabular-nums text-ink-soft">{subtitle}</p>
              </div>
            </div>

            {/* Barre de santé + légende, ou repère « aucun routeur » */}
            <div className="mt-auto" aria-label={t.statusFor.replace("{name}", client.name)}>
              {total === 0 ? (
                <p className="rounded-xl bg-clay px-3 py-2.5 text-center text-sm text-ink-soft">{t.noRouter}</p>
              ) : (
                <>
                  <div
                    className="flex h-2.5 overflow-hidden rounded-full bg-clay"
                    role="img"
                    aria-label={`${t.online.replace("{count}", String(routerCounts.online))}, ${t.configuring.replace("{count}", String(routerCounts.configuring))}, ${t.offline.replace("{count}", String(routerCounts.offline))}`}
                  >
                    {routerCounts.online > 0 && <span className="block h-full bg-ok" style={{ width: pct(routerCounts.online) }} />}
                    {routerCounts.configuring > 0 && <span className="block h-full bg-warn" style={{ width: pct(routerCounts.configuring) }} />}
                    {routerCounts.offline > 0 && <span className="block h-full bg-err" style={{ width: pct(routerCounts.offline) }} />}
                  </div>
                  <div className="mt-2.5 flex flex-wrap gap-x-3.5 gap-y-1 text-xs">
                    <LegendItem count={routerCounts.online} label={t.legendOnline} color="bg-ok" />
                    <LegendItem count={routerCounts.configuring} label={t.legendConfiguring} color="bg-warn" />
                    <LegendItem
                      count={routerCounts.offline}
                      label={t.legendOffline}
                      color={routerCounts.offline > 0 ? "bg-err" : "bg-line-soft"}
                      emphasize={routerCounts.offline > 0}
                    />
                  </div>
                </>
              )}
            </div>

            {/* Actions — ghost « Ouvrir » puis CTA lime « Voir les routeurs » */}
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/admin/users?org=${client.id}`}
                aria-label={t.openOrganizationFor.replace("{name}", client.name)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-line-soft bg-paper px-3.5 py-2 text-sm font-bold text-ink transition-colors duration-150 hover:bg-clay focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              >
                {t.openOrganization}
                <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link
                href={`/admin/router?scope=clients&org=${client.id}`}
                aria-label={t.viewRoutersFor.replace("{name}", client.name)}
                className="inline-flex items-center gap-1.5 rounded-full border border-line bg-brand px-3.5 py-2 text-sm font-bold text-slate-deep transition-colors duration-150 hover:bg-ink hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              >
                {t.viewRouters}
                <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </article>
        );
      })}
    </div>
  );
}
