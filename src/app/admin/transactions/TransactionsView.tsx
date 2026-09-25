import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, ChevronLeft, ChevronRight, Download } from "lucide-react";
import DateRangePicker from "../DateRangePicker";
import { LEDGER_CATEGORIES, type LedgerCategory, type LedgerEntry, type summarizeLedger } from "@/lib/finance/ledger";
import type { AdminDictionary } from "@/lib/i18n/admin";

export const LEDGER_PAGE_SIZE = 50;

/**
 * Rendu du journal, sans base ni session (page.tsx cherche les données) — ce
 * qui permet de le vérifier visuellement hors connexion.
 */
export default function TransactionsView({
  t,
  locale,
  entries,
  summary,
  picker,
  category,
  page,
  csvHref,
}: {
  t: AdminDictionary["finance"]["transactions"];
  locale: string;
  /** Toutes les entrées de la période (le filtre de catégorie est appliqué ici). */
  entries: LedgerEntry[];
  summary: ReturnType<typeof summarizeLedger>;
  picker: { from: string; to: string; activePreset: string | null };
  category: LedgerCategory | null;
  page: number;
  csvHref: string;
}) {
  const money = (n: number) => `${Math.abs(n).toLocaleString(locale)} FCFA`;
  const signed = (n: number) => `${n < 0 ? "−" : "+"}${money(n)}`;
  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  const filtered = category ? entries.filter((e) => e.category === category) : entries;
  const pages = Math.max(1, Math.ceil(filtered.length / LEDGER_PAGE_SIZE));
  const current = Math.min(Math.max(1, page), pages);
  const slice = filtered.slice((current - 1) * LEDGER_PAGE_SIZE, current * LEDGER_PAGE_SIZE);
  const href = (c: LedgerCategory | null, p = 1) =>
    `?from=${picker.from}&to=${picker.to}${c ? `&type=${c}` : ""}${p > 1 ? `&page=${p}` : ""}`;

  return (
    <div className="animate-fade-in-up space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{t.title}</h1>
          <p className="mt-1 max-w-xl text-sm text-ink-soft">{t.description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DateRangePicker from={picker.from} to={picker.to} activePreset={picker.activePreset} />
          {entries.length > 0 && (
            <a
              href={csvHref}
              download={`transactions-${picker.from}_${picker.to}.csv`}
              className="btn btn-md btn-outline inline-flex items-center gap-2"
            >
              <Download aria-hidden="true" className="h-4 w-4" />
              {t.exportCsv}
            </a>
          )}
        </div>
      </header>

      {/* Le NET est la réponse ; entrées et sorties le composent. Le rouge est
          réservé au net négatif — le seul cas où il y a quelque chose à faire. */}
      <section className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-line bg-line-soft sm:grid-cols-[1.6fr_1fr_1fr]">
        <div className="bg-paper p-5">
          <p className="text-sm text-ink-soft">{t.net}</p>
          <p className={`mt-1 text-3xl font-semibold tracking-tight tabular-nums sm:text-4xl ${summary.netCents < 0 ? "text-err" : "text-ink"}`}>
            {summary.netCents < 0 ? "−" : ""}
            {money(summary.netCents)}
          </p>
        </div>
        <div className="bg-paper p-5">
          <p className="flex items-center gap-1.5 text-xs text-ink-soft">
            <ArrowDownLeft aria-hidden="true" className="h-3.5 w-3.5 text-ok" /> {t.totalIn}
          </p>
          <p className="mt-1.5 text-lg font-semibold tabular-nums text-ink">+{money(summary.inCents)}</p>
        </div>
        <div className="bg-paper p-5">
          <p className="flex items-center gap-1.5 text-xs text-ink-soft">
            <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5 text-err" /> {t.totalOut}
          </p>
          <p className="mt-1.5 text-lg font-semibold tabular-nums text-ink">−{money(summary.outCents)}</p>
        </div>
      </section>

      {/* Catégories : chaque pastille est un filtre ET un sous-total. */}
      <nav aria-label={t.byCategory} className="flex flex-wrap gap-2">
        {[null, ...LEDGER_CATEGORIES].map((c) => {
          const active = category === c;
          const stat = c ? summary.byCategory[c] : null;
          return (
            <Link
              key={c ?? "all"}
              href={href(c)}
              scroll={false}
              aria-current={active ? "page" : undefined}
              className={`inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-sm ${
                active ? "border-slate-deep bg-slate-deep text-white" : "border-line bg-paper text-ink hover:bg-clay"
              }`}
            >
              <span className={active ? "font-semibold" : ""}>{c ? t.categories[c] : t.all}</span>
              <span className={`text-xs tabular-nums ${active ? "text-white/80" : "text-ink-soft"}`}>
                {stat ? (stat.count ? signed(stat.totalCents) : "0") : t.movements(entries.length)}
              </span>
            </Link>
          );
        })}
      </nav>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line px-6 py-14 text-center">
          <p className="font-semibold text-ink">{t.emptyPeriod}</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-ink-soft">{t.emptyPeriodHint}</p>
        </div>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-line bg-paper">
          {/* Cartes sous md : sur un téléphone, la table cachait le montant. */}
          <ul role="list" className="divide-y divide-line-soft md:hidden">
            {slice.map((e) => (
              <li key={`m-${e.category}-${e.id}`} className="p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 font-medium text-ink">{e.label}</span>
                  <span className={`shrink-0 font-semibold tabular-nums ${e.amountCents < 0 ? "text-err" : "text-ink"}`}>
                    {signed(e.amountCents)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-ink-soft">
                  {t.categories[e.category]} · {dateFmt.format(e.date)}
                  {e.note ? ` · ${e.note}` : ""}
                </p>
              </li>
            ))}
          </ul>

          <table className="hidden w-full text-left text-sm md:table">
            <thead className="border-b border-line bg-clay/40 text-xs text-ink-soft">
              <tr>
                <th className="px-5 py-2.5 font-medium">{t.date}</th>
                <th className="px-5 py-2.5 font-medium">{t.category}</th>
                <th className="px-5 py-2.5 font-medium">{t.detail}</th>
                <th className="px-5 py-2.5 font-medium">{t.note}</th>
                <th className="px-5 py-2.5 text-right font-medium">{t.amount}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {slice.map((e) => (
                <tr key={`${e.category}-${e.id}`} className="hover:bg-clay/40">
                  <td className="whitespace-nowrap px-5 py-3 text-ink-soft">{dateFmt.format(e.date)}</td>
                  <td className="px-5 py-3">
                    {/* Pastille neutre : la catégorie classe, elle n'alerte pas. */}
                    <span className="inline-flex h-6 items-center rounded-full bg-clay px-2.5 text-xs font-medium text-ink-soft">
                      {t.categories[e.category]}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-ink">{e.label}</td>
                  <td className="max-w-52 truncate px-5 py-3 text-ink-soft" title={e.note ?? undefined}>{e.note ?? "—"}</td>
                  <td className={`whitespace-nowrap px-5 py-3 text-right font-medium tabular-nums ${e.amountCents < 0 ? "text-err" : "text-ink"}`}>
                    {signed(e.amountCents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3 text-xs text-ink-soft">
            <span className="tabular-nums">
              {t.pageInfo((current - 1) * LEDGER_PAGE_SIZE + 1, (current - 1) * LEDGER_PAGE_SIZE + slice.length, filtered.length)}
            </span>
            {pages > 1 && (
              <nav aria-label="Pagination" className="flex items-center gap-1.5">
                {current > 1 && (
                  <Link href={href(category, current - 1)} scroll={false} className="btn btn-sm btn-outline inline-flex items-center gap-1">
                    <ChevronLeft aria-hidden="true" className="h-3.5 w-3.5" /> {t.previous}
                  </Link>
                )}
                <span className="px-1 tabular-nums">{current} / {pages}</span>
                {current < pages && (
                  <Link href={href(category, current + 1)} scroll={false} className="btn btn-sm btn-outline inline-flex items-center gap-1">
                    {t.next} <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />
                  </Link>
                )}
              </nav>
            )}
          </div>
        </section>
      )}

      <p className="text-xs text-ink-soft">{t.salesSource}</p>
    </div>
  );
}
