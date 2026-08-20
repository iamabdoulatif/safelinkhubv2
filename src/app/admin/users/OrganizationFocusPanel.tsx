import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Router, Users } from "lucide-react";
import { isConfiguringRouter } from "../router/router-portfolio";
import type { OrganizationFocus } from "./organization-focus";

type OrganizationFocusPanelProps = {
  focus: OrganizationFocus;
  compact?: boolean;
};

function pluralize(count: number, singular: string, plural: string) {
  return count === 1 ? singular : plural;
}

function routerStatusLabel(status: string) {
  if (status === "online") return "En ligne";
  if (isConfiguringRouter(status)) return "En configuration";
  return "Hors ligne";
}

export function OrganizationFocusPanel({ focus, compact = false }: OrganizationFocusPanelProps) {
  return (
    <section
      className={compact ? "border border-line bg-brand/10 p-4 md:p-5" : "border border-line bg-paper p-5 md:p-6"}
      aria-labelledby={`organization-focus-${focus.id}`}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-deep">Organisation ciblée</p>
          <h2 id={`organization-focus-${focus.id}`} className="mt-1 font-display text-2xl font-extrabold tracking-tight text-ink">
            {focus.name}
          </h2>
          <p className="mt-2 text-sm text-ink-soft">
            Vue limitée aux utilisateurs et routeurs de cette organisation.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/router?scope=clients"
            className="inline-flex items-center gap-2 border border-line bg-paper px-3 py-2 text-sm font-semibold text-ink transition-colors hover:bg-clay rounded-xl"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Retour aux parcs clients
          </Link>
          {focus.routerTableHref && (
            <Link
              href={focus.routerTableHref}
              className="inline-flex items-center gap-2 border border-line bg-brand px-3 py-2 text-sm font-bold text-ink transition-colors hover:bg-ink hover:text-paper"
            >
              Voir la table technique <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          )}
        </div>
      </div>

      <dl className={compact ? "mt-4 grid gap-3 border-y border-line py-3 sm:grid-cols-2 xl:grid-cols-5" : "mt-5 grid gap-3 border-y border-line-soft py-4 sm:grid-cols-2 xl:grid-cols-5"}>
        <div>
          <dt className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-ink-soft">
            <Users className="h-4 w-4" aria-hidden="true" /> Utilisateurs
          </dt>
          <dd className="mt-1 font-display text-2xl font-extrabold text-ink">
            {focus.memberCount} {pluralize(focus.memberCount, "utilisateur", "utilisateurs")}
          </dd>
        </div>
        <div>
          <dt className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-ink-soft">
            <Router className="h-4 w-4" aria-hidden="true" /> Routeurs
          </dt>
          <dd className="mt-1 font-display text-2xl font-extrabold text-ink">
            {focus.routerCounts.total} {pluralize(focus.routerCounts.total, "routeur", "routeurs")}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-bold uppercase tracking-wide text-ink-soft">En ligne</dt>
          <dd className="mt-1 text-lg font-bold text-ok">En ligne : {focus.routerCounts.online}</dd>
        </div>
        <div>
          <dt className="text-xs font-bold uppercase tracking-wide text-ink-soft">Configuration</dt>
          <dd className="mt-1 text-lg font-bold text-ink">En configuration : {focus.routerCounts.configuring}</dd>
        </div>
        <div>
          <dt className="text-xs font-bold uppercase tracking-wide text-ink-soft">Hors ligne</dt>
          <dd className="mt-1 text-lg font-bold text-err">Hors ligne : {focus.routerCounts.offline}</dd>
        </div>
      </dl>

      <section className="mt-5" aria-label={`Routeurs de ${focus.name}`}>
        <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-ink-soft">Routeurs de l’organisation</h3>
        {focus.routers.length === 0 ? (
          <p className="mt-3 border border-dashed border-line-soft bg-clay/35 px-4 py-3 text-sm text-ink-soft">
            Aucun routeur n’est encore rattaché à cette organisation.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-line-soft border border-line-soft">
            {focus.routers.map((router) => (
              <li key={router.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-ink">{router.name}</p>
                  <p className="mt-0.5 truncate text-xs text-ink-soft">{router.model ?? "Modèle non renseigné"}</p>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs text-ink-soft">
                  <span>{routerStatusLabel(router.status)}</span>
                  <span>{router.activeUsers ?? 0} {pluralize(router.activeUsers ?? 0, "utilisateur actif", "utilisateurs actifs")}</span>
                  <Link
                    href={`/admin/router/${router.id}`}
                    className="inline-flex items-center gap-1.5 border border-line bg-paper px-2.5 py-1.5 font-semibold text-ink hover:bg-clay rounded-xl"
                  >
                    Détail <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
