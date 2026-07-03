"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowUpRight, Link2, Router as RouterIcon, Search } from "lucide-react";
import RouterRowActions from "./RouterRowActions";
import SyncAllButton from "./SyncAllButton";

type StatusFilter = "all" | "online" | "offline" | "config";

function isStatusFilter(value: string | null): value is StatusFilter {
  return value === "all" || value === "online" || value === "offline" || value === "config";
}

export type RouterRow = {
  id: string;
  name: string;
  model: string | null;
  host: string | null;
  apiPort: number | null;
  status: string;
  cpuLoad: number | null;
  memoryUsage: string | null;
  activeUsers: number | null;
  lastSyncAtMs: number | null;
  connectionMethod: string;
};

function isConfiguring(status: string) {
  return status === "pending" || status === "installing";
}

export function timeAgo(ms: number | null) {
  if (!ms) return "jamais";
  const seconds = Math.floor((Date.now() - ms) / 1000);
  if (seconds < 60) return "à l'instant";
  if (seconds < 3600) return `il y a ${Math.floor(seconds / 60)} min`;
  if (seconds < 86400) return `il y a ${Math.floor(seconds / 3600)} h`;
  return `il y a ${Math.floor(seconds / 86400)} j`;
}

function StatusBadge({ status }: { status: string }) {
  const config = isConfiguring(status);
  const online = status === "online";
  return (
    <span className="inline-flex items-center gap-1.5 border border-line-soft bg-paper px-2 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wide text-ink">
      <span
        aria-hidden="true"
        className={`h-2 w-2 rounded-full ${
          online ? "bg-ok" : config ? "bg-warn" : "bg-err"
        }`}
      />
      {online ? "En ligne" : config ? "Configuration" : "Hors ligne"}
    </span>
  );
}

/** Petite jauge éditoriale : barre plate bordée, remplissage moutarde. */
function MeterCell({ percent }: { percent: number }) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <span className="flex items-center gap-2">
      <span aria-hidden="true" className="h-2 w-14 shrink-0 border border-line bg-paper">
        <span className="block h-full bg-brand" style={{ width: `${clamped}%` }} />
      </span>
      <span className="tabular-nums text-ink-soft">{clamped}%</span>
    </span>
  );
}

export default function RoutersTable({ routers }: { routers: RouterRow[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const initialFilter = isStatusFilter(searchParams.get("status"))
    ? (searchParams.get("status") as StatusFilter)
    : "all";
  const initialQuery = searchParams.get("q") ?? "";

  const [filter, setFilter] = useState<StatusFilter>(initialFilter);
  const [query, setQuery] = useState(initialQuery);

  // Keep the URL in sync with the active filter/search so the view is
  // shareable and survives a refresh or browser back/forward. Debounced:
  // router.replace à chaque frappe ferait un aller-retour RSC par lettre.
  useEffect(() => {
    const timer = setTimeout(() => {
      const params = new URLSearchParams();
      if (filter !== "all") params.set("status", filter);
      if (query) params.set("q", query);
      const next = params.toString();
      const current = searchParams.toString();
      if (next !== current) {
        router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [filter, query, pathname, router, searchParams]);

  const counts = useMemo(
    () => ({
      all: routers.length,
      online: routers.filter((r) => r.status === "online").length,
      offline: routers.filter((r) => r.status !== "online" && !isConfiguring(r.status)).length,
      config: routers.filter((r) => isConfiguring(r.status)).length,
    }),
    [routers],
  );

  const filtered = routers.filter((r) => {
    if (filter === "online" && r.status !== "online") return false;
    if (filter === "offline" && (r.status === "online" || isConfiguring(r.status))) return false;
    if (filter === "config" && !isConfiguring(r.status)) return false;
    if (query) {
      const q = query.toLowerCase();
      const haystack = `${r.name} ${r.host ?? ""} ${r.model ?? ""}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  return (
    <div>
      {/* En-tête éditorial */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
            Routeurs MikroTik
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            Gestion, synchronisation et provisionnement de vos MikroTik.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SyncAllButton />
          <Link
            href="/admin/settings/router-setup"
            className="flex items-center gap-2 border-2 border-line bg-brand px-4 py-2 text-sm font-bold text-[#1C1917] transition-colors duration-150 hover:bg-ink hover:text-paper"
          >
            <Link2 aria-hidden="true" className="h-4 w-4" />
            Lier un MikroTik
          </Link>
        </div>
      </div>

      {/* Filtres en chips */}
      <div className="mt-6 flex flex-wrap items-center gap-2" role="group" aria-label="Filtrer par statut">
        {(
          [
            ["all", "Tous"],
            ["online", "En ligne"],
            ["offline", "Hors ligne"],
            ["config", "Configuration"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={filter === key}
            onClick={() => setFilter(key)}
            className={`flex items-center gap-2 border-2 border-line px-3 py-1.5 text-sm font-bold transition-colors duration-150 ${
              filter === key
                ? "bg-brand text-[#1C1917]"
                : "bg-paper text-ink-soft hover:bg-clay hover:text-ink"
            }`}
          >
            {label}
            <span
              className={`px-1.5 font-mono text-xs ${
                filter === key ? "bg-[#1C1917] text-brand" : "bg-clay text-ink-soft"
              }`}
            >
              {counts[key]}
            </span>
          </button>
        ))}
      </div>

      {/* Recherche large */}
      <div className="relative mt-4">
        <Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
        <input
          type="search"
          name="router-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher par nom, IP ou identité…"
          aria-label="Rechercher un routeur par nom, IP ou identité"
          className="w-full border-2 border-line bg-paper py-2.5 pl-10 pr-3 text-sm text-ink placeholder:text-ink-soft focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="mt-4 border-2 border-line bg-paper px-4 py-14 text-center">
          <RouterIcon aria-hidden="true" className="mx-auto h-8 w-8 text-ink-soft" />
          <p className="mt-3 font-display text-lg font-bold text-ink">
            {routers.length === 0 ? "Aucun routeur lié" : "Aucun résultat"}
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-ink-soft">
            {routers.length === 0
              ? "Commencez par lier un MikroTik : le provisionnement et la supervision se font ensuite automatiquement."
              : "Aucun routeur ne correspond à ce filtre ou à cette recherche."}
          </p>
          {routers.length === 0 && (
            <Link
              href="/admin/settings/router-setup"
              className="mt-5 inline-flex items-center gap-2 border-2 border-line bg-brand px-4 py-2 text-sm font-bold text-[#1C1917] transition-colors duration-150 hover:bg-ink hover:text-paper"
            >
              <Link2 aria-hidden="true" className="h-4 w-4" />
              Lier un MikroTik
            </Link>
          )}
        </div>
      ) : (
        <>
          {/* Mobile : cartes empilées */}
          <ul className="mt-4 space-y-3 md:hidden">
            {filtered.map((r) => (
              <li key={r.id} className="border-2 border-line bg-paper p-4 transition-transform duration-150">
                <div className="flex items-start justify-between gap-2">
                  <Link
                    href={`/admin/router/${r.id}`}
                    className="min-w-0 font-display text-base font-bold text-ink hover:text-brand-deep"
                  >
                    <span className="block truncate">{r.name}</span>
                    <span className="block truncate font-mono text-xs font-medium text-ink-soft">
                      {r.host ? `${r.host}:${r.apiPort ?? 8728}` : "—"}
                    </span>
                  </Link>
                  <StatusBadge status={r.status} />
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 border-t border-line-soft pt-3 text-xs">
                  <div className="flex justify-between gap-2">
                    <dt className="text-ink-soft">Identité</dt>
                    <dd className="truncate font-medium text-ink">{r.model ?? "—"}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-ink-soft">Utilisateurs</dt>
                    <dd className="tabular-nums font-medium text-ink">{r.activeUsers ?? 0}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-ink-soft">CPU</dt>
                    <dd className="tabular-nums font-medium text-ink">{r.cpuLoad ?? 0}%</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-ink-soft">RAM</dt>
                    <dd className="tabular-nums font-medium text-ink">{Math.round(Number(r.memoryUsage ?? 0))}%</dd>
                  </div>
                  <div className="col-span-2 flex justify-between gap-2">
                    <dt className="text-ink-soft">Dernière synchro</dt>
                    {/* timeAgo dépend de Date.now() : le texte serveur peut
                        différer d'une poignée de secondes au moment de
                        l'hydratation — écart attendu, pas un bug. */}
                    <dd suppressHydrationWarning className="font-medium text-ink">
                      {timeAgo(r.lastSyncAtMs)}
                    </dd>
                  </div>
                </dl>
                <div className="mt-3 flex items-center justify-between gap-2 border-t border-line-soft pt-3">
                  <Link
                    href={`/admin/router/${r.id}`}
                    className="flex items-center gap-1 border-2 border-line px-2.5 py-1 text-xs font-bold text-ink transition-colors duration-150 hover:bg-clay"
                  >
                    Détails
                    <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" />
                  </Link>
                  <RouterRowActions routerId={r.id} />
                </div>
              </li>
            ))}
          </ul>

          {/* Desktop / tablette : table éditoriale */}
          <div className="mt-4 hidden overflow-x-auto border-2 border-line bg-paper md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b-2 border-line bg-clay">
                <tr className="font-mono text-[11px] font-semibold uppercase tracking-widest text-ink-soft">
                  <th scope="col" className="px-4 py-3">Routeur</th>
                  <th scope="col" className="px-4 py-3">Identité</th>
                  <th scope="col" className="px-4 py-3">Statut</th>
                  <th scope="col" className="px-4 py-3">CPU</th>
                  <th scope="col" className="px-4 py-3">RAM</th>
                  <th scope="col" className="px-4 py-3">Utilisateurs</th>
                  <th scope="col" className="px-4 py-3">Dernière synchro</th>
                  <th scope="col" className="px-4 py-3">
                    <span className="sr-only">Actions</span>
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
                      <Link href={`/admin/router/${r.id}`} className="group block">
                        <span className="font-bold text-ink group-hover:text-brand-deep">{r.name}</span>
                        <span className="block font-mono text-xs text-ink-soft">
                          {r.host ? `${r.host}:${r.apiPort ?? 8728}` : "—"}
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-ink">{r.model ?? "—"}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-4 py-3">
                      <MeterCell percent={r.cpuLoad ?? 0} />
                    </td>
                    <td className="px-4 py-3">
                      <MeterCell percent={Math.round(Number(r.memoryUsage ?? 0))} />
                    </td>
                    <td className="px-4 py-3 tabular-nums text-ink">{r.activeUsers ?? 0}</td>
                    <td suppressHydrationWarning className="px-4 py-3 text-ink-soft">
                      {timeAgo(r.lastSyncAtMs)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/admin/router/${r.id}`}
                          className="flex items-center gap-1 border-2 border-line px-2.5 py-1 text-xs font-bold text-ink transition-colors duration-150 hover:bg-brand"
                        >
                          Détails
                          <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" />
                        </Link>
                        <RouterRowActions routerId={r.id} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-2 font-mono text-xs text-ink-soft">
            {filtered.length} routeur{filtered.length > 1 ? "s" : ""} affiché{filtered.length > 1 ? "s" : ""}
          </p>
        </>
      )}
    </div>
  );
}
