import Link from "next/link";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import DateRangePicker from "../DateRangePicker";
import type { PaidSale } from "@/lib/sales/paid-orders";
import type { LigneZone } from "@/lib/sales/par-zone";
import type { SalesSummary } from "@/lib/sales/summary";
import type { AdminDictionary } from "@/lib/i18n/admin";

export const SALES_PAGE_SIZE = 50;

/**
 * Rendu de la page Ventes, sans base ni session (page.tsx cherche les données)
 * — ce qui permet de la vérifier visuellement hors connexion.
 */
export default function SalesView({
  t,
  locale,
  sales,
  summary,
  zones,
  picker,
  page,
  csvHref,
}: {
  t: AdminDictionary["finance"]["sales"];
  locale: string;
  sales: PaidSale[];
  summary: SalesSummary;
  zones: LigneZone[];
  picker: { from: string; to: string; activePreset: string | null };
  page: number;
  csvHref: string;
}) {
  const money = (n: number) => `${n.toLocaleString(locale)} FCFA`;
  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  const dayFmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" });
  const pages = Math.max(1, Math.ceil(sales.length / SALES_PAGE_SIZE));
  const current = Math.min(Math.max(1, page), pages);
  const slice = sales.slice((current - 1) * SALES_PAGE_SIZE, current * SALES_PAGE_SIZE);
  const peak = Math.max(1, ...summary.daily.map((d) => d.revenueCents));
  const pageHref = (p: number) => `?from=${picker.from}&to=${picker.to}${p > 1 ? `&page=${p}` : ""}`;

  return (
    <div className="animate-fade-in-up space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{t.title}</h1>
          <p className="mt-1 max-w-xl text-sm text-ink-soft">{t.description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DateRangePicker from={picker.from} to={picker.to} activePreset={picker.activePreset} />
          {summary.count > 0 && (
            <a
              href={csvHref}
              download={`ventes-${picker.from}_${picker.to}.csv`}
              className="btn btn-md btn-outline inline-flex items-center gap-2"
            >
              <Download aria-hidden="true" className="h-4 w-4" />
              {t.exportCsv}
            </a>
          )}
        </div>
      </header>

      {/* Chiffres : le revenu de la période porte la page, le reste l'accompagne. */}
      <section className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line-soft lg:grid-cols-[1.6fr_repeat(4,1fr)]">
        <div className="col-span-2 bg-paper p-5 lg:col-span-1">
          <p className="text-sm text-ink-soft">{t.periodRevenue}</p>
          <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums text-ink sm:text-4xl">
            {money(summary.revenueCents)}
          </p>
        </div>
        {(
          [
            [t.net, money(summary.netCents)],
            [t.count, summary.count.toLocaleString(locale)],
            [t.average, money(summary.averageCents)],
            [t.todayRevenue, money(summary.todayCents)],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="bg-paper p-5">
            <p className="text-xs text-ink-soft">{label}</p>
            <p className="mt-1.5 text-lg font-semibold tabular-nums text-ink">{value}</p>
          </div>
        ))}
      </section>

      {summary.count === 0 ? (
        <div className="rounded-2xl border border-dashed border-line px-6 py-14 text-center">
          <p className="font-semibold text-ink">{t.emptyPeriod}</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-ink-soft">{t.emptyPeriodHint}</p>
        </div>
      ) : (
        <>
          {/* Revenu par jour : barres simples, le montant au survol et en
              lecture d'écran — l'œil voit les pics, le chiffre reste exact. */}
          <section className="rounded-2xl border border-line bg-paper p-5 sm:p-6">
            <h2 className="text-sm font-semibold text-ink">{t.daily}</h2>
            <ol className="mt-4 flex h-36 items-end gap-[3px]" aria-label={t.daily}>
              {summary.daily.map((d) => {
                const label = `${dayFmt.format(new Date(`${d.day}T12:00:00`))} : ${money(d.revenueCents)} · ${t.zoneSales(d.count)}`;
                return (
                  <li key={d.day} className="group relative flex h-full min-w-0 flex-1 items-end" title={label}>
                    <span className="sr-only">{label}</span>
                    <span
                      aria-hidden="true"
                      className={`w-full rounded-t-sm ${d.revenueCents ? "bg-slate-deep group-hover:bg-brand-deep" : "bg-line-soft"}`}
                      style={{ height: d.revenueCents ? `${Math.max(4, (d.revenueCents / peak) * 100)}%` : "2px" }}
                    />
                  </li>
                );
              })}
            </ol>
            <div className="mt-2 flex justify-between text-xs text-ink-soft">
              <span>{dayFmt.format(new Date(`${summary.daily[0]?.day}T12:00:00`))}</span>
              <span>{dayFmt.format(new Date(`${summary.daily.at(-1)?.day}T12:00:00`))}</span>
            </div>
          </section>

          {/* Deux lectures côte à côte : OÙ ça se vend, et QUOI. */}
          <div className="grid gap-5 lg:grid-cols-2">
            {[
              { title: t.byZone, hint: t.byZoneHint, rows: zones.map((z) => ({ key: z.routerId ?? "—", name: z.nom, count: z.ventes, revenue: z.revenuCents, part: z.part })) },
              { title: t.byPackage, hint: null, rows: summary.byPackage.map((p) => ({ key: p.name, name: p.name, count: p.count, revenue: p.revenueCents, part: p.part })) },
            ].map((block) => (
              <section key={block.title} className="rounded-2xl border border-line bg-paper p-5 sm:p-6">
                <h2 className="text-sm font-semibold text-ink">{block.title}</h2>
                {block.hint && <p className="mt-0.5 text-xs text-ink-soft">{block.hint}</p>}
                <ul role="list" className="mt-4 space-y-3.5">
                  {block.rows.map((r) => (
                    <li key={r.key}>
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="min-w-0 truncate text-sm text-ink">{r.name}</span>
                        <span className="shrink-0 text-sm font-semibold tabular-nums text-ink">{money(r.revenue)}</span>
                      </div>
                      <div className="mt-1.5 flex items-center gap-3">
                        <div aria-hidden="true" className="h-1.5 flex-1 overflow-hidden rounded-full bg-line-soft">
                          <div className="h-full rounded-full bg-slate-deep" style={{ width: `${r.part}%` }} />
                        </div>
                        <span className="w-28 shrink-0 text-right text-xs tabular-nums text-ink-soft">
                          {t.zoneSales(r.count)} · {r.part} %
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>

          <section className="overflow-hidden rounded-2xl border border-line bg-paper">
            {/* Cartes sous md : six colonnes dans 375 px séparaient le ticket de son montant. */}
            <ul role="list" className="divide-y divide-line-soft md:hidden">
              {slice.map((s) => (
                <li key={`m-${s.id}`} className="p-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate font-mono text-sm font-semibold text-ink">{s.username}</span>
                    <span className="shrink-0 font-semibold tabular-nums text-ink">{money(s.priceCents)}</span>
                  </div>
                  <p className="mt-1 text-xs text-ink-soft">
                    {s.packageName}
                    {s.routerName ? ` · ${s.routerName}` : ""} · {dateFmt.format(s.createdAt)}
                  </p>
                </li>
              ))}
            </ul>

            <table className="hidden w-full text-left text-sm md:table">
              <thead className="border-b border-line bg-clay/40 text-xs text-ink-soft">
                <tr>
                  <th className="px-5 py-2.5 font-medium">{t.date}</th>
                  <th className="px-5 py-2.5 font-medium">{t.voucher}</th>
                  <th className="px-5 py-2.5 font-medium">{t.zone}</th>
                  <th className="px-5 py-2.5 font-medium">{t.package}</th>
                  <th className="px-5 py-2.5 text-right font-medium">{t.price}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {slice.map((s) => (
                  <tr key={s.id} className="hover:bg-clay/40">
                    <td className="whitespace-nowrap px-5 py-3 text-ink-soft">{dateFmt.format(s.createdAt)}</td>
                    <td className="px-5 py-3 font-mono text-[13px] font-semibold text-ink">{s.username}</td>
                    <td className="px-5 py-3 text-ink-soft">{s.routerName ?? "—"}</td>
                    <td className="px-5 py-3 text-ink-soft">{s.packageName}</td>
                    <td className="whitespace-nowrap px-5 py-3 text-right font-medium tabular-nums text-ink">{money(s.priceCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3 text-xs text-ink-soft">
              <span className="tabular-nums">
                {t.pageInfo((current - 1) * SALES_PAGE_SIZE + 1, (current - 1) * SALES_PAGE_SIZE + slice.length, sales.length)}
              </span>
              {pages > 1 && (
                <nav aria-label="Pagination" className="flex items-center gap-1.5">
                  {current > 1 ? (
                    <Link href={pageHref(current - 1)} scroll={false} className="btn btn-sm btn-outline inline-flex items-center gap-1">
                      <ChevronLeft aria-hidden="true" className="h-3.5 w-3.5" /> {t.previous}
                    </Link>
                  ) : null}
                  <span className="px-1 tabular-nums">{current} / {pages}</span>
                  {current < pages ? (
                    <Link href={pageHref(current + 1)} scroll={false} className="btn btn-sm btn-outline inline-flex items-center gap-1">
                      {t.next} <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />
                    </Link>
                  ) : null}
                </nav>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
