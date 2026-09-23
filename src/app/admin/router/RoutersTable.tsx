"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Table, Td, Th, Tr } from "@/components/ui/Table";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowUpRight, Link2, MapPin, Router as RouterIcon, Search } from "lucide-react";
import { buttonClass } from "@/components/ui/Button";
import { LockedBadge, MeterCell, StatusBadge } from "./RouterBadges";
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

  const displayed = table.displayed
    .replace("{count}", String(filtered.length))
    .replace("{router}", filtered.length > 1 ? t.clients.routerPlural : t.clients.router)
    .replace("{plural}", filtered.length > 1 ? "s" : "");

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* En-tête : titre à gauche, actions à droite — la disposition de toutes
          les pages de l'administration. UNE action principale (lier un
          MikroTik), les actions de parc repliées dans un menu. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          {backHref && (
            <Link
              href={backHref}
              className="mb-2 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-ink-soft transition-colors duration-150 hover:text-ink"
            >
              <ArrowLeft aria-hidden="true" className="h-4 w-4" />
              {backLabel ?? table.back}
            </Link>
          )}
          <Heading
            className={`font-semibold tracking-tight text-ink ${
              headingLevel === "h1" ? "text-2xl" : "text-lg sm:text-xl"
            }`}
          >
            {title ?? table.title}
          </Heading>
          <p className="mt-1 text-sm text-ink-soft">{description ?? table.description}</p>
        </div>
        {showFleetActions && (
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
            <FleetActions t={fleet} actions={actions} table={table} />
            <Link href="/admin/settings/router-setup?new=1" className={buttonClass({ variant: "primary" })}>
              <Link2 aria-hidden="true" className="h-4 w-4" />
              {table.linkMikrotik}
            </Link>
          </div>
        )}
      </div>

      {health.total > 0 && <FleetPulse health={health} t={fleet} table={table} />}

      <FleetAttention
        health={health}
        t={fleet}
        table={table}
        onShowOffline={() => setFilter("offline")}
      />

      {/* Barre d'outils : recherche puis filtres, sur une ligne dès la
          tablette. On cherche un nom bien plus souvent qu'on ne trie par état. */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-4">
        <div className="relative md:max-w-md md:flex-1">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
          <input
            type="search"
            name="router-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={table.search}
            aria-label={table.search}
            className="field pl-9"
          />
        </div>

        {/* Contrôle segmenté ; défilement horizontal sur téléphone plutôt
            qu'un retour à la ligne qui repousserait le premier routeur. */}
        <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
          <div
            role="group"
            aria-label={table.filterByStatus}
            className="inline-flex gap-1 rounded-full bg-line-soft p-1"
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
                className={`flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[13px] transition-colors duration-150 ${
                  filter === key
                    ? "border-line bg-paper font-semibold text-ink"
                    : "border-transparent font-medium text-ink-soft hover:text-ink"
                }`}
              >
                {label}
                <span className="tabular-nums text-ink-soft">{counts[key]}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line-strong/50 bg-paper px-4 py-12 text-center">
          <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-clay">
            <RouterIcon aria-hidden="true" className="h-5 w-5 text-brand-deep" />
          </span>
          <p className="mt-3 text-sm font-semibold text-ink">
            {routers.length === 0 ? table.emptyFleet : table.emptySearch}
          </p>
          <p className="mx-auto mt-1 max-w-sm text-[13px] text-ink-soft">
            {routers.length === 0 ? table.emptyFleetText : table.emptySearchText}
          </p>
          {routers.length === 0 ? (
            <Link
              href="/admin/settings/router-setup?new=1"
              className={buttonClass({ variant: "primary", className: "mt-5" })}
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
              className={buttonClass({ variant: "outline", className: "mt-5" })}
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
          <Table className="hidden md:block" caption={t.page.title}>
            <thead>
              <tr>
                <Th>{table.router}</Th>
                <Th>{table.status}</Th>
                <Th className="whitespace-nowrap">
                  {table.cpu} · {table.ram}
                </Th>
                <Th numeric>{table.users}</Th>
                <Th className="whitespace-nowrap">{table.lastSync}</Th>
                <Th>
                  <span className="sr-only">{table.actions}</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const offline = isOfflineRouter(r.status);
                return (
                  <Tr key={r.id}>
                    <Td>
                      <Link href={`/admin/router/${r.id}`} className="group block max-w-[16rem]">
                        <span className="block truncate font-semibold text-ink group-hover:text-brand-deep">
                          {r.name}
                        </span>
                        {/* Le modèle rejoint l'adresse : une colonne à lui seul
                            faisait déborder le tableau dès 1280 px. */}
                        <span className="block truncate text-xs text-ink-soft">
                          {r.model ?? "—"}
                          {r.host && <span className="font-mono"> · {r.host}:{r.apiPort ?? 8728}</span>}
                        </span>
                        {r.location && (
                          <span className="mt-0.5 flex items-center gap-1 text-xs text-ink-soft">
                            <MapPin aria-hidden="true" className="h-3 w-3 shrink-0" />
                            <span className="truncate">{r.location}</span>
                          </span>
                        )}
                      </Link>
                    </Td>
                    <Td>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <StatusBadge status={r.status} t={table} />
                        {r.locked && <LockedBadge t={table} />}
                      </div>
                    </Td>
                    {/* Un routeur muet ne publie pas de mesure crédible :
                        « 0 % » ferait passer une absence de mesure pour une
                        mesure (même règle que les cartes mobiles). */}
                    <Td>
                      {offline ? (
                        <MeterCell percent={null} />
                      ) : (
                        <span className="flex flex-col gap-1">
                          <MeterCell label={table.cpu} percent={r.cpuLoad ?? 0} />
                          <MeterCell label={table.ram} percent={Number(r.memoryUsage ?? 0)} />
                        </span>
                      )}
                    </Td>
                    <Td numeric className={offline ? "text-ink-soft" : "text-ink"}>
                      {offline ? "—" : (r.activeUsers ?? 0)}
                    </Td>
                    <Td
                      suppressHydrationWarning
                      className={`whitespace-nowrap ${offline ? "font-medium text-err" : "text-ink-soft"}`}
                    >
                      {timeAgo(r.lastSyncAtMs, table)}
                    </Td>
                    <Td>
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          href={offline ? `/admin/router/${r.id}?tab=diagnostic` : `/admin/router/${r.id}`}
                          className={buttonClass({ variant: "outline", size: "sm" })}
                        >
                          {offline ? fleet.diagnose : table.details}
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
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>

          <p className="text-xs text-ink-soft">{displayed}</p>
        </>
      )}
    </div>
  );
}
