import { eq, desc } from "drizzle-orm";
import { TrendingUp } from "lucide-react";
import { getDb } from "@/lib/db";
import { vouchers, packages } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";

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
  const db = getDb();

  const orgPackages = session
    ? await db
        .select()
        .from(packages)
        .where(eq(packages.orgId, session.orgId))
    : [];
  const packageById = new Map(orgPackages.map((p) => [p.id, p]));

  const orgVouchers = session
    ? await db
        .select()
        .from(vouchers)
        .where(eq(vouchers.orgId, session.orgId))
        .orderBy(desc(vouchers.createdAt))
    : [];

  const sales = orgVouchers
    .filter((v) => packageById.has(v.packageId ?? ""))
    .map((v) => {
      const pkg = packageById.get(v.packageId!)!;
      return {
        id: v.id,
        username: v.username,
        packageName: pkg.name,
        priceCents: pkg.priceCents,
        commissionCents: pkg.commissionCents,
        status: v.status,
        createdAt: v.createdAt,
      };
    });

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
        Revenu généré par la vente de vouchers, basé sur les forfaits émis.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="border-2 border-line bg-paper p-5 hover-lift">
          <p className="text-sm font-medium text-ink-soft">Revenu total</p>
          <p className="mt-1 text-2xl font-bold text-ink">
            {formatFcfa(totalRevenueCents)}
          </p>
        </div>
        <div className="border-2 border-line bg-paper p-5 hover-lift">
          <p className="text-sm font-medium text-ink-soft">Revenu aujourd&apos;hui</p>
          <p className="mt-1 text-2xl font-bold text-ink">
            {formatFcfa(todayRevenueCents)}
          </p>
        </div>
        <div className="border-2 border-line bg-paper p-5 hover-lift">
          <p className="text-sm font-medium text-ink-soft">Ventes / Commissions</p>
          <p className="mt-1 text-2xl font-bold text-ink">
            {sales.length}{" "}
            <span className="text-sm font-normal text-ink-soft">
              ({formatFcfa(totalCommissionCents)} en commissions)
            </span>
          </p>
        </div>
      </div>

      <div className="mt-6 overflow-hidden border-2 border-line bg-paper">
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
