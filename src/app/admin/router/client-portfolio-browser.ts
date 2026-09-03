/**
 * Logique PURE de la barre de recherche + tri de la grille « Parcs clients ».
 * Isolée ici pour se tester sans rendu ni DOM (voir .test.ts).
 */
import type { ClientPortfolio } from "./router-portfolio";

export type PortfolioSort = "name" | "routers" | "offline";

/** Minuscule + sans accents : « Nébié » et « nebie » se rejoignent. */
export function normalizeSearch(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

/** Agrégat affiché dans le bandeau de résumé (tous clients confondus). */
export type PortfolioSummary = {
  organizations: number;
  routers: number;
  online: number;
  offline: number;
};

export function summarizePortfolios(clients: ClientPortfolio[]): PortfolioSummary {
  return clients.reduce(
    (acc, c) => ({
      organizations: acc.organizations + 1,
      routers: acc.routers + c.routerCounts.total,
      online: acc.online + c.routerCounts.online,
      offline: acc.offline + c.routerCounts.offline,
    }),
    { organizations: 0, routers: 0, online: 0, offline: 0 },
  );
}

/**
 * Filtre par nom (insensible casse/accents) puis trie. Le tri « offline » place
 * en tête les organisations qui ont le plus de routeurs hors ligne — celles qui
 * demandent une action — départage par nom.
 */
export function filterAndSortClients(
  clients: ClientPortfolio[],
  query: string,
  sort: PortfolioSort,
  opts: { onlyOffline?: boolean } = {},
): ClientPortfolio[] {
  const q = normalizeSearch(query);
  let filtered = q ? clients.filter((c) => normalizeSearch(c.name).includes(q)) : clients.slice();
  // Filtre rapide « à traiter » : ne garde que les organisations qui ont au
  // moins un routeur hors ligne.
  if (opts.onlyOffline) filtered = filtered.filter((c) => c.routerCounts.offline > 0);

  const byName = (a: ClientPortfolio, b: ClientPortfolio) =>
    a.name.localeCompare(b.name, "fr", { sensitivity: "base" });

  switch (sort) {
    case "routers":
      return filtered.sort((a, b) => b.routerCounts.total - a.routerCounts.total || byName(a, b));
    case "offline":
      return filtered.sort((a, b) => b.routerCounts.offline - a.routerCounts.offline || byName(a, b));
    case "name":
    default:
      return filtered.sort(byName);
  }
}
