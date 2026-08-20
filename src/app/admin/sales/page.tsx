import { TrendingUp } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { getPaidSales } from "@/lib/sales/paid-orders";

function formatFcfa(cents: number) {
  return `FCFA ${cents.toLocaleString("en-US")}`;
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", {
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
  const session = await getSession();

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

  return (
    <div className="mx-auto max-w-5xl animate-fade-in-up">
      <div className="flex items-center gap-2">
        <TrendingUp className="h-5 w-5 text-ink" />
        <h1 className="text-2xl font-bold text-ink">Ventes</h1>
      </div>
      <p className="mt-1 text-sm text-ink-soft">
        Revenu réellement encaissé par la passerelle GeniusPay au portail captif.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="border border-line bg-paper p-5 hover-lift rounded-xl">
          <p className="text-sm font-medium text-ink-soft">Revenu total</p>
          <p className="mt-1 text-2xl font-bold text-ink">
            {formatFcfa(totalRevenueCents)}
          </p>
        </div>
        <div className="border border-line bg-paper p-5 hover-lift rounded-xl">
          <p className="text-sm font-medium text-ink-soft">Revenu aujourd&apos;hui</p>
          <p className="mt-1 text-2xl font-bold text-ink">
            {formatFcfa(todayRevenueCents)}
          </p>
        </div>
        <div className="border border-line bg-paper p-5 hover-lift rounded-xl">
          <p className="text-sm font-medium text-ink-soft">Ventes / Commissions</p>
          <p className="mt-1 text-2xl font-bold text-ink">
            {sales.length}{" "}
            <span className="text-sm font-normal text-ink-soft">
              ({formatFcfa(totalCommissionCents)} en commissions)
            </span>
          </p>
        </div>
      </div>

      <div className="mt-6 overflow-hidden border border-line bg-paper">
        <div className="table-mobile-wrapper">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line-soft bg-clay text-ink-soft">
            <tr>
              <th className="px-4 py-3 font-medium">Voucher</th>
              <th className="px-4 py-3 font-medium">Forfait</th>
              <th className="px-4 py-3 font-medium">Prix</th>
              <th className="px-4 py-3 font-medium">Statut</th>
              <th className="px-4 py-3 font-medium">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-soft">
            {sales.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-ink-soft">
                  Aucune vente pour le moment.
                </td>
              </tr>
            )}
            {sales.map((s) => (
              <tr key={s.id}>
                <td className="px-4 py-3 font-medium text-ink">
                  {s.username}
                </td>
                <td className="px-4 py-3 text-ink-soft">{s.packageName}</td>
                <td className="px-4 py-3 font-medium text-ok">
                  {formatFcfa(s.priceCents)}
                </td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-clay px-2.5 py-1 text-xs font-medium text-ink-soft">
                    {s.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-ink-soft">
                  {formatDate(s.createdAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
