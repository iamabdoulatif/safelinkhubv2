import { TrendingUp } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { getPaidSales } from "@/lib/sales/paid-orders";
import { revenuParZone } from "@/lib/sales/par-zone";
import { getAdminDict } from "@/lib/i18n/admin";
import { getLocale } from "@/lib/i18n/server";

function formatFcfa(cents: number, locale: string) {
  return `FCFA ${cents.toLocaleString(locale)}`;
}

function formatDate(date: Date, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export default async function SalesPage() {
  const [session, locale, dict] = await Promise.all([getSession(), getLocale(), getAdminDict()]);
  const t = dict.finance.sales;

  // Uniquement l'argent encaissé par la passerelle : les tickets créés en lot,
  // importés du MikroTik ou vendus par un agent ne sont pas du revenu en ligne.
  const sales = session ? await getPaidSales(session.orgId) : [];

  const now = new Date();
  const totalRevenueCents = sales.reduce((sum, s) => sum + s.priceCents, 0);
  const todayRevenueCents = sales
    .filter((s) => isSameDay(s.createdAt, now))
    .reduce((sum, s) => sum + s.priceCents, 0);
  const totalCommissionCents = sales.reduce(
    (sum, s) => sum + s.commissionCents,
    0,
  );
  const zones = revenuParZone(sales);

  return (
    <div className="mx-auto max-w-5xl animate-fade-in-up">
      <div className="flex items-center gap-2">
        <TrendingUp className="h-5 w-5 text-ink" />
        <h1 className="text-2xl font-bold text-ink">{t.title}</h1>
      </div>
      <p className="mt-1 text-sm text-ink-soft">
        {t.description}
      </p>

      {/* Trois cartes de même poids : on ne savait pas laquelle lire. Le
          revenu de la période porte la page, le reste l'accompagne. */}
      <section className="mt-6 rounded-xl border border-line bg-paper p-5 sm:p-6">
        <p className="text-sm text-ink-soft">{t.totalRevenue}</p>
        <p className="mt-1 font-display text-3xl font-extrabold tabular-nums text-ink sm:text-4xl">
          {formatFcfa(totalRevenueCents, locale)}
        </p>
        <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 border-t border-line-soft pt-4 text-sm">
          <div className="flex items-baseline gap-2">
            <dt className="text-ink-soft">{t.todayRevenue}</dt>
            <dd className="font-semibold tabular-nums text-ink">
              {formatFcfa(todayRevenueCents, locale)}
            </dd>
          </div>
          <div className="flex items-baseline gap-2">
            <dt className="text-ink-soft">{t.salesCommission}</dt>
            <dd className="font-semibold tabular-nums text-ink">
              {sales.length}{" "}
              <span className="font-normal text-ink-soft">
                {t.commission(formatFcfa(totalCommissionCents, locale))}
              </span>
            </dd>
          </div>
        </dl>
      </section>

      {zones.length > 0 && (
        <section className="mt-6 border border-line bg-paper p-5 rounded-xl">
          <h2 className="text-sm font-semibold text-ink">{t.byZone}</h2>
          <p className="mt-0.5 text-xs text-ink-soft">{t.byZoneHint}</p>
          <ul className="mt-4 space-y-3" role="list">
            {zones.map((z) => (
              <li key={z.routerId ?? "sans-routeur"}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <span className="text-sm font-medium text-ink">{z.nom}</span>
                  <span className="text-sm font-bold tabular-nums text-ink">
                    {formatFcfa(z.revenuCents, locale)}
                  </span>
                </div>
                {/* La barre double le chiffre plutôt que de le remplacer : elle
                    se lit d'un coup d'œil, le montant reste la donnée. */}
                <div className="mt-1.5 flex items-center gap-3">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-clay">
                    <div className="h-full rounded-full bg-brand" style={{ width: `${z.part}%` }} />
                  </div>
                  <span className="w-24 shrink-0 text-right text-xs tabular-nums text-ink-soft">
                    {t.zoneSales(z.ventes)} · {z.part}%
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {sales.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-line-soft bg-paper p-10 text-center">
          <p className="font-display text-lg font-bold text-ink">{t.empty}</p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-ink-soft">{t.description}</p>
        </div>
      ) : (
      <div className="mt-6 overflow-hidden rounded-xl border border-line bg-paper">
        {/* Cartes sous md : six colonnes dans 375 px imposaient un défilement
            latéral qui séparait le ticket de son montant. */}
        <ul role="list" className="divide-y divide-line-soft md:hidden">
          {sales.map((s) => (
            <li key={`m-${s.id}`} className="p-4">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate font-medium text-ink">{s.username}</span>
                <span className="shrink-0 font-semibold tabular-nums text-ink">
                  {formatFcfa(s.priceCents, locale)}
                </span>
              </div>
              <p className="mt-1 text-xs text-ink-soft">
                {s.packageName}
                {s.routerName ? ` · ${s.routerName}` : ""} · {formatDate(s.createdAt, locale)}
              </p>
            </li>
          ))}
        </ul>

        <table className="hidden w-full text-left text-sm md:table">
          <thead className="border-b border-line-soft bg-clay text-ink-soft">
            <tr>
              <th className="px-4 py-3 font-medium">{t.voucher}</th>
              <th className="px-4 py-3 font-medium">{t.zone}</th>
              <th className="px-4 py-3 font-medium">{t.package}</th>
              <th className="px-4 py-3 text-right font-medium">{t.price}</th>
              <th className="px-4 py-3 font-medium">{t.status}</th>
              <th className="px-4 py-3 font-medium">{t.date}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-soft">
            {sales.map((s) => (
              <tr key={s.id} className="hover:bg-clay">
                <td className="px-4 py-3 font-medium text-ink">{s.username}</td>
                <td className="px-4 py-3 text-ink-soft">
                  {s.routerName ?? <span className="italic">{"—"}</span>}
                </td>
                <td className="px-4 py-3 text-ink-soft">{s.packageName}</td>
                {/* Toutes les lignes sont des ventes : les peindre toutes en
                    vert ne distingue aucune d'elles. */}
                <td className="whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums text-ink">
                  {formatFcfa(s.priceCents, locale)}
                </td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-clay px-2.5 py-1 text-xs font-medium text-ink-soft">
                    {s.status}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-ink-soft">
                  {formatDate(s.createdAt, locale)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-line bg-clay">
            <tr className="font-semibold text-ink">
              <td className="px-4 py-3" colSpan={3}>{t.totalRevenue}</td>
              <td className="px-4 py-3 text-right tabular-nums">
                {formatFcfa(totalRevenueCents, locale)}
              </td>
              <td className="px-4 py-3" colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
      )}
    </div>
  );
}
