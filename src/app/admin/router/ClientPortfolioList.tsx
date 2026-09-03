import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { ClientPortfolio } from "./router-portfolio";
import type { RouterDictionary } from "./RoutersTable";

/**
 * Vue LISTE (table dense) de la grille « Parcs clients » — alternative aux
 * cartes pour parcourir vite un grand parc. Même données, présentation compacte.
 */
export function ClientPortfolioList({
  clients,
  t,
}: {
  clients: ClientPortfolio[];
  t: RouterDictionary["clients"];
}) {
  return (
    <div className="overflow-x-auto border border-line bg-paper rounded-xl">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-line bg-clay">
          <tr className="font-mono text-[11px] font-semibold uppercase tracking-widest text-ink-soft">
            <th className="px-4 py-3">{t.organization}</th>
            <th className="px-4 py-3">{t.users}</th>
            <th className="px-4 py-3">{t.routers}</th>
            <th className="px-4 py-3">{t.summaryOnline}</th>
            <th className="px-4 py-3">{t.summaryOffline}</th>
            <th className="px-4 py-3 text-right">{t.colActions}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line-soft">
          {clients.map((c) => (
            <tr key={c.id} className="align-middle">
              <td className="px-4 py-3 font-semibold text-ink">{c.name}</td>
              <td className="px-4 py-3 tabular-nums text-ink">{c.memberCount}</td>
              <td className="px-4 py-3 tabular-nums text-ink">{c.routerCounts.total}</td>
              <td className="px-4 py-3">
                <span className="inline-flex items-center gap-1.5 tabular-nums text-ink">
                  <span aria-hidden="true" className="h-2 w-2 rounded-full bg-ok" />
                  {c.routerCounts.online}
                </span>
              </td>
              <td className="px-4 py-3">
                <span
                  className={`inline-flex items-center gap-1.5 tabular-nums ${
                    c.routerCounts.offline > 0 ? "font-bold text-err" : "text-ink-soft"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`h-2 w-2 rounded-full ${c.routerCounts.offline > 0 ? "bg-err" : "bg-line"}`}
                  />
                  {c.routerCounts.offline}
                </span>
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-2">
                  <Link
                    href={`/admin/users?org=${c.id}`}
                    className="inline-flex items-center gap-1 border border-line bg-paper px-2.5 py-1.5 text-xs font-bold text-ink hover:bg-clay rounded-xl"
                  >
                    {t.openOrganization}
                    <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" />
                  </Link>
                  <Link
                    href={`/admin/router?scope=clients&org=${c.id}`}
                    className="inline-flex items-center gap-1 border border-line bg-brand px-2.5 py-1.5 text-xs font-bold text-slate-deep hover:bg-ink hover:text-paper rounded-full"
                  >
                    {t.viewRouters}
                    <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
