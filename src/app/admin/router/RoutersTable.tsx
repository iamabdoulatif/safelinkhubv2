"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowUpRight, Link2, Lock, MapPin, Router as RouterIcon, Search } from "lucide-react";
import RouterRowActions from "./RouterRowActions";
import { FleetActions } from "./FleetActions";
import { FleetAttention } from "./FleetAttention";
import { FleetPulse } from "./FleetPulse";
import { RouterCard } from "./RouterCard";
import { computeFleetHealth, isOfflineRouter } from "./fleet-health";
import { isConfiguringRouter } from "./router-portfolio";
import { buildRouterTableQuery, type RouterTableStatusFilter } from "./router-table-query";
import { timeAgo } from "./router-row";
import type { RouterDictionary, RouterRow } from "./router-row";
import type { Locale } from "@/lib/i18n/config";

export { timeAgo };
export type { RouterDictionary, RouterRow };

type StatusFilter = RouterTableStatusFilter;

function isStatusFilter(value: string | null): value is StatusFilter {
  return value === "all" || value === "online" || value === "offline" || value === "config";
}

function StatusBadge({ status, t }: { status: string; t: RouterDictionary["table"] }) {
  const config = isConfiguringRouter(status);
  const online = status === "online";
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink">
      <span
        aria-hidden="true"
        className={`h-2 w-2 rounded-full ${online ? "bg-ok" : config ? "bg-warn" : "bg-err"}`}
      />
      {online ? t.online : config ? t.configuring : t.offline}
    </span>
  );
}

/** Chip « Verrouillé » : routeur paralysé par le kill-switch (ports coupés sauf ether1). */
function LockedBadge({ t }: { t: RouterDictionary["table"] }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-err px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
      <Lock aria-hidden="true" className="h-3 w-3" />
      {t.locked}
    </span>
  );
}

/** Petite jauge : barre fine, remplissage de marque. */
function MeterCell({ percent }: { percent: number }) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <span className="flex items-center gap-2">
      <span aria-hidden="true" className="h-1.5 w-14 shrink-0 overflow-hidden rounded-full bg-clay">
        <span className="block h-full rounded-full bg-brand-deep" style={{ width: `${clamped}%` }} />
      </span>
      <span className="tabular-nums text-ink-soft">{clamped}%</span>
    </span>
  );
}

type RoutersTableProps = {
  routers: RouterRow[];
  title?: string;
  description?: string;
  headingLevel?: "h1" | "h2";
  backHref?: string;
  backLabel?: string;
  showFleetActions?: boolean;
  /** Superadmin : donne accès au kill-switch (verrouiller/déverrouiller) par ligne. */
  canLock?: boolean;
  t: RouterDictionary;
  locale: Locale;
};

/**
 * Le parc : d'abord son ÉTAT, ensuite ses lignes.
 *
 * L'écran ouvrait sur deux titres, cinq boutons de même poids et quatre chips
 * de filtre qui portaient, seules, les chiffres du parc — il fallait les
 * additionner de tête pour savoir si tout allait bien, et faire défiler deux
 * écrans et demi sur téléphone avant d'atteindre le premier routeur. L'ordre
 * suit désormais celui des questions qu'on se pose devant un parc : combien,
 * lesquels vont mal, que puis-je faire, puis seulement la liste.
 *
 * La logique n'a pas bougé : mêmes filtres, même recherche, même
 * synchronisation d'URL (partageable, restaurée au rechargement).
 */
export default function RoutersTable({
  routers,
  title,
  description,
  headingLevel = "h1",
  backHref,
  backLabel,
  showFleetActions = true,
  canLock = false,
  t,
}: RoutersTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const initialFilter = isStatusFilter(searchParams.get("status"))
    ? (searchParams.get("status") as StatusFilter)
    : "all";
  const initialQuery = searchParams.get("q") ?? "";

  const [filter, setFilter] = useState<StatusFilter>(initialFilter);
  const [query, setQuery] = useState(initialQuery);
  const Heading = headingLevel;
  const table = t.table;
  const actions = t.actions;
  const fleet = t.fleet;
  const statusLabels: Record<StatusFilter, string> = {
    all: table.all,
    online: table.online,
    offline: table.offline,
    config: table.configuring,
  };

  // Keep the URL in sync with the active filter/search so the view is
  // shareable and survives a refresh or browser back/forward. Debounced:
  // router.replace à chaque frappe ferait un aller-retour RSC par lettre.
  useEffect(() => {
    const timer = setTimeout(() => {
      const params = buildRouterTableQuery(searchParams, { status: filter, query });
      const next = params.toString();
      const current = searchParams.toString();
      if (next !== current) {
        router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [filter, query, pathname, router, searchParams]);

  // Un seul balayage sert la bande d'état, la zone d'attention ET les
  // compteurs de filtres : trois lectures du même parc donnaient trois
  // occasions de diverger.
  const health = useMemo(() => computeFleetHealth(routers), [routers]);
  const counts = {
    all: health.total,
    online: health.online,
    offline: health.offline,
    config: health.configuring,
  };

  const filtered = routers.filter((r) => {
    if (filter === "online" && r.status !== "online") return false;
    if (filter === "offline" && !isOfflineRouter(r.status)) return false;
    if (filter === "config" && !isConfiguringRouter(r.status)) return false;
    if (query) {
      const q = query.toLowerCase();
      const haystack = `${r.name} ${r.host ?? ""} ${r.model ?? ""} ${r.location ?? ""}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* En-tête : un seul niveau de titre, une phrase. */}
      <div>
        {backHref && (
          <Link
            href={backHref}
            className="mb-2 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-ink-soft transition-colors duration-150 hover:text-ink"
          >
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            {backLabel ?? table.back}
          </Link>
        )}
        <Heading className="font-display text-xl font-semibold tracking-tight text-ink sm:text-2xl">
          {title ?? table.title}
        </Heading>
        <p className="mt-1 text-sm text-ink-soft">{description ?? table.description}</p>
      </div>

      {health.total > 0 && <FleetPulse health={health} t={fleet} table={table} />}

      <FleetAttention
        health={health}
        t={fleet}
        table={table}
        onShowOffline={() => setFilter("offline")}
      />

      {/* Barre d'action : UNE action principale, le reste replié. */}
      {showFleetActions && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
          <Link
            href="/admin/settings/router-setup?new=1"
            className="slate-btn slate-btn-primary flex min-h-11 items-center justify-center gap-2 px-4 text-sm"
          >
            <Link2 aria-hidden="true" className="h-4 w-4" />
            {table.linkMikrotik}
          </Link>
          <FleetActions t={fleet} actions={actions} table={table} />
        </div>
      )}

      {/* Recherche puis filtres : on cherche un nom bien plus souvent qu'on ne
          trie par état, et les filtres portent leur compteur juste dessous. */}
      <div>
        <div className="relative">
          <Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
          <input
            type="search"
            name="router-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={table.search}
            aria-label={table.search}
            className="h-11 w-full rounded-full border border-line bg-paper pl-10 pr-3 text-sm text-ink placeholder:text-ink-soft focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          />
        </div>

        {/* Défilement horizontal plutôt qu'un retour à la ligne : quatre chips
            sur deux étages repoussaient le premier routeur d'autant. Les
            marges négatives laissent le défilement filer jusqu'au bord. */}
        <div
          role="group"
          aria-label={table.filterByStatus}
          className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0"
        >
          {(
            [
              ["all", statusLabels.all],
              ["online", statusLabels.online],
              ["offline", statusLabels.offline],
              ["config", statusLabels.config],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={filter === key}
              onClick={() => setFilter(key)}
              className={`flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors duration-150 ${
                filter === key
                  ? "border-ink bg-ink text-paper"
                  : "border-line bg-paper text-ink-soft hover:bg-clay hover:text-ink"
              }`}
            >
              {label}
              <span
                className={`rounded-full px-1.5 text-xs tabular-nums ${
                  filter === key ? "bg-paper/20 text-paper" : "bg-clay text-ink-soft"
                }`}
              >
                {counts[key]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="slate-card bg-paper px-4 py-12 text-center">
          <RouterIcon aria-hidden="true" className="mx-auto h-8 w-8 text-ink-soft" />
          <p className="mt-3 font-display text-base font-semibold text-ink">
            {routers.length === 0 ? table.emptyFleet : table.emptySearch}
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-ink-soft">
            {routers.length === 0 ? table.emptyFleetText : table.emptySearchText}
          </p>
          {routers.length === 0 ? (
            <Link
              href="/admin/settings/router-setup?new=1"
              className="slate-btn slate-btn-primary mt-5 inline-flex min-h-11 items-center gap-2 px-4 text-sm"
            >
              <Link2 aria-hidden="true" className="h-4 w-4" />
              {table.linkMikrotik}
            </Link>
          ) : (
            /* Une recherche sans résultat laissait l'exploitant devant un cul-de-sac :
               il fallait vider le champ ET repérer le filtre resté actif. */
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setFilter("all");
              }}
              className="slate-btn slate-btn-ghost mt-5 inline-flex min-h-11 items-center gap-2 px-4 text-sm"
            >
              {fleet.resetFilters}
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Mobile : cartes empilées */}
          <ul role="list" className="space-y-3 md:hidden">
            {filtered.map((r) => (
              <RouterCard key={r.id} r={r} t={t} canLock={canLock} />
            ))}
          </ul>

          {/* Desktop / tablette : table — on y compare des lignes entre elles,
              ce que des cartes côte à côte font moins bien. */}
          <div className="slate-card hidden overflow-x-auto bg-paper md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line bg-clay">
                <tr className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
                  <th scope="col" className="px-4 py-3">{table.router}</th>
                  <th scope="col" className="px-4 py-3">{table.identity}</th>
                  <th scope="col" className="px-4 py-3">{table.status}</th>
                  <th scope="col" className="px-4 py-3">{table.cpu}</th>
                  <th scope="col" className="px-4 py-3">{table.ram}</th>
                  <th scope="col" className="px-4 py-3">{table.users}</th>
                  <th scope="col" className="px-4 py-3">{table.lastSync}</th>
                  <th scope="col" className="px-4 py-3">
                    <span className="sr-only">{table.actions}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-line-soft transition-colors duration-150 last:border-0 hover:bg-clay"
                  >
                    <td className="px-4 py-3">
                      <Link href={`/admin/router/${r.id}`} className="group block max-w-[18rem]">
                        <span className="block truncate font-semibold text-ink group-hover:text-brand-deep">
                          {r.name}
                        </span>
                        <span className="block truncate font-mono text-xs text-ink-soft">
                          {r.host ? `${r.host}:${r.apiPort ?? 8728}` : "—"}
                        </span>
                        {r.location && (
                          <span className="mt-0.5 flex items-center gap-1 text-xs text-ink-soft">
                            <MapPin aria-hidden="true" className="h-3 w-3 shrink-0" />
                            <span className="truncate">{r.location}</span>
                          </span>
                        )}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-ink">{r.model ?? "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <StatusBadge status={r.status} t={table} />
                        {r.locked && <LockedBadge t={table} />}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <MeterCell percent={r.cpuLoad ?? 0} />
                    </td>
                    <td className="px-4 py-3">
                      <MeterCell percent={Math.round(Number(r.memoryUsage ?? 0))} />
                    </td>
                    <td className="px-4 py-3 tabular-nums text-ink">{r.activeUsers ?? 0}</td>
                    <td suppressHydrationWarning className="px-4 py-3 text-ink-soft">
                      {timeAgo(r.lastSyncAtMs, table)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          href={
                            isOfflineRouter(r.status)
                              ? `/admin/router/${r.id}?tab=diagnostic`
                              : `/admin/router/${r.id}`
                          }
                          className="flex items-center gap-1 rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-ink transition-colors duration-150 hover:bg-clay"
                        >
                          {isOfflineRouter(r.status) ? fleet.diagnose : table.details}
                          <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" />
                        </Link>
                        <RouterRowActions
                          routerId={r.id}
                          routerName={r.name}
                          t={actions}
                          canLock={canLock}
                          locked={Boolean(r.locked)}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-ink-soft">
            {table.displayed
              .replace("{count}", String(filtered.length))
              .replace("{router}", filtered.length > 1 ? t.clients.routerPlural : t.clients.router)
              .replace("{plural}", filtered.length > 1 ? "s" : "")}
          </p>
        </>
      )}
    </div>
  );
}
