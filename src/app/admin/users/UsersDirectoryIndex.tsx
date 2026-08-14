"use client";

import { RotateCcw, Search, SlidersHorizontal } from "lucide-react";
import type { UserControlFilter } from "./users-control-center";

type UsersDirectoryIndexProps = {
  query: string;
  activeFilter: UserControlFilter;
  resultCount: number;
  filterCounts: Record<UserControlFilter, number>;
  filters: Array<{ value: UserControlFilter; label: string }>;
  onQueryChange: (query: string) => void;
  onFilterChange: (filter: UserControlFilter) => void;
  onReset: () => void;
};

export function UsersDirectoryIndex({
  query,
  activeFilter,
  resultCount,
  filterCounts,
  filters,
  onQueryChange,
  onFilterChange,
  onReset,
}: UsersDirectoryIndexProps) {
  const resetDisabled = !query && activeFilter === "all";

  return (
    <section aria-label="Index du registre" className="border-y-2 border-line py-4">
      <label className="flex min-w-0 items-center gap-3 border-2 border-line bg-paper px-3.5 py-3 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ink">
        <Search className="h-4 w-4 shrink-0 text-ink-soft" aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Rechercher par nom, email ou organisation…"
          className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-soft"
          aria-label="Rechercher un utilisateur"
        />
      </label>

      <div className="mt-4 flex flex-col gap-3 border-t border-line-soft pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p aria-live="polite" className="flex items-center gap-2 text-xs text-ink-soft">
          <SlidersHorizontal className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="font-semibold text-ink">{resultCount} affiché{resultCount > 1 ? "s" : ""}</span>
        </p>
        <button
          type="button"
          onClick={onReset}
          disabled={resetDisabled}
          className="inline-flex items-center gap-1.5 self-start border border-line px-2.5 py-1.5 text-xs font-medium text-ink hover:bg-clay disabled:cursor-not-allowed disabled:opacity-40 sm:self-auto"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Réinitialiser
        </button>
      </div>

      <div className="mt-3 flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filtres utilisateurs">
        {filters.map((filter) => {
          const active = activeFilter === filter.value;

          return (
            <button
              key={filter.value}
              type="button"
              onClick={() => onFilterChange(filter.value)}
              aria-pressed={active}
              className={`inline-flex shrink-0 items-center gap-2 border px-3 py-2 text-xs font-medium transition-colors ${
                active ? "border-ink bg-ink text-paper" : "border-line bg-paper text-ink hover:bg-clay"
              }`}
            >
              {filter.label}
              <span className="font-semibold tabular-nums">{filterCounts[filter.value]}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
