"use client";

import { useMemo, useState } from "react";
import { Search, X, Building2, Router as RouterIcon, Wifi, WifiOff, SlidersHorizontal, LayoutGrid, List } from "lucide-react";
import { ClientPortfolioGrid } from "./ClientPortfolioGrid";
import { ClientPortfolioList } from "./ClientPortfolioList";
import {
  filterAndSortClients,
  summarizePortfolios,
  type PortfolioSort,
} from "./client-portfolio-browser";
import type { ClientPortfolio } from "./router-portfolio";
import type { RouterDictionary } from "./RoutersTable";

/**
 * Enveloppe interactive de la grille « Parcs clients » : recherche par nom
 * (insensible aux accents), tri, bandeau de résumé du parc global, et compteur
 * de résultats. La logique de filtre/tri est pure (client-portfolio-browser.ts,
 * testée) ; ce composant ne fait que l'état + le rendu.
 */
export function ClientPortfolioBrowser({
  clients,
  t,
}: {
  clients: ClientPortfolio[];
  t: RouterDictionary["clients"];
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<PortfolioSort>("name");
  const [onlyOffline, setOnlyOffline] = useState(false);
  const [view, setView] = useState<"cards" | "list">("cards");

  const summary = useMemo(() => summarizePortfolios(clients), [clients]);
  const visible = useMemo(
    () => filterAndSortClients(clients, query, sort, { onlyOffline }),
    [clients, query, sort, onlyOffline],
  );

  // Grille vide « de base » (aucun client du tout) : on laisse la grille rendre
  // son propre état vide traduit. La recherche sans résultat a son état à elle.
  if (clients.length === 0) {
    return <ClientPortfolioGrid clients={clients} t={t} />;
  }

  const count = visible.length;
  const countLabel = (count === 1 ? t.resultsCount : t.resultsCountPlural).replace("{count}", String(count));

  return (
    <div>
      {/* ── Bandeau de résumé du parc global ── */}
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryTile icon={Building2} label={t.summaryOrganizations} value={summary.organizations} />
        <SummaryTile icon={RouterIcon} label={t.summaryRouters} value={summary.routers} />
        <SummaryTile icon={Wifi} label={t.summaryOnline} value={summary.online} tone="ok" />
        <SummaryTile icon={WifiOff} label={t.summaryOffline} value={summary.offline} tone="err" />
      </dl>

      {/* ── Barre de recherche + tri ── */}
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={t.searchLabel}
            placeholder={t.searchPlaceholder}
            className="w-full rounded-full border border-line bg-paper py-2.5 pl-10 pr-10 text-sm text-ink placeholder:text-ink-soft focus:border-ink focus:outline-none focus:ring-2 focus:ring-brand"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label={t.clearSearch}
              className="absolute right-2.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-ink-soft hover:bg-clay hover:text-ink"
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
          )}
        </div>

        <label className="flex shrink-0 items-center gap-2 text-sm text-ink-soft">
          <SlidersHorizontal aria-hidden="true" className="h-4 w-4" />
          <span className="sr-only sm:not-sr-only">{t.sortLabel}</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as PortfolioSort)}
            className="rounded-full border border-line bg-paper px-3 py-2 text-sm font-semibold text-ink focus:border-ink focus:outline-none focus:ring-2 focus:ring-brand"
          >
            <option value="name">{t.sortName}</option>
            <option value="routers">{t.sortRouters}</option>
            <option value="offline">{t.sortOffline}</option>
          </select>
        </label>

        {/* Filtre rapide « à traiter » */}
        <button
          type="button"
          aria-pressed={onlyOffline}
          onClick={() => setOnlyOffline((v) => !v)}
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-2 text-sm font-semibold transition-colors ${
            onlyOffline
              ? "border-err bg-err text-white"
              : "border-line bg-paper text-ink hover:bg-clay"
          }`}
        >
          <WifiOff aria-hidden="true" className="h-4 w-4" />
          {t.filterOffline}
        </button>

        {/* Bascule cartes / liste */}
        <div className="inline-flex shrink-0 overflow-hidden rounded-full border border-line" role="group">
          <button
            type="button"
            aria-pressed={view === "cards"}
            onClick={() => setView("cards")}
            title={t.viewCards}
            aria-label={t.viewCards}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-semibold ${
              view === "cards" ? "bg-brand text-slate-deep" : "bg-paper text-ink hover:bg-clay"
            }`}
          >
            <LayoutGrid aria-hidden="true" className="h-4 w-4" />
            <span className="hidden sm:inline">{t.viewCards}</span>
          </button>
          <button
            type="button"
            aria-pressed={view === "list"}
            onClick={() => setView("list")}
            title={t.viewList}
            aria-label={t.viewList}
            className={`flex items-center gap-1.5 border-l border-line px-3 py-2 text-sm font-semibold ${
              view === "list" ? "bg-brand text-slate-deep" : "bg-paper text-ink hover:bg-clay"
            }`}
          >
            <List aria-hidden="true" className="h-4 w-4" />
            <span className="hidden sm:inline">{t.viewList}</span>
          </button>
        </div>
      </div>

      <p className="mt-3 text-xs font-medium uppercase tracking-wide text-ink-soft" aria-live="polite">
        {countLabel}
      </p>

      {/* ── Résultats ── */}
      <div className="mt-3">
        {count === 0 ? (
          <section className="border border-dashed border-line bg-clay/40 p-6 text-center rounded-xl">
            <Search className="mx-auto h-6 w-6 text-ink-soft" aria-hidden="true" />
            <h3 className="mt-3 text-base font-bold text-ink">{t.noMatchTitle}</h3>
            <p className="mt-1 text-sm text-ink-soft">{t.noMatchText.replace("{query}", query)}</p>
            <button
              type="button"
              onClick={() => setQuery("")}
              className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-line bg-paper px-4 py-2 text-sm font-bold text-ink hover:bg-clay"
            >
              <X aria-hidden="true" className="h-4 w-4" />
              {t.clearSearch}
            </button>
          </section>
        ) : view === "list" ? (
          <ClientPortfolioList clients={visible} t={t} />
        ) : (
          <ClientPortfolioGrid clients={visible} t={t} />
        )}
      </div>
    </div>
  );
}

function SummaryTile({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Building2;
  label: string;
  value: number;
  tone?: "ok" | "err";
}) {
  const valueColor = tone === "ok" ? "text-ok" : tone === "err" ? "text-err" : "text-ink";
  return (
    <div className="border border-line bg-paper p-4 rounded-xl">
      <dt className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-ink-soft">
        <Icon aria-hidden="true" className="h-4 w-4" />
        {label}
      </dt>
      <dd className={`mt-2 font-display text-2xl font-extrabold tabular-nums ${valueColor}`}>{value}</dd>
    </div>
  );
}
