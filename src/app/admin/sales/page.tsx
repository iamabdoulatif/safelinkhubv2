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
    <div className="mx-auto max-w-5xl">
      <div className="flex items-center gap-2">
        <TrendingUp className="h-5 w-5 text-slate-700" />
        <h1 className="text-2xl font-bold text-slate-900">Ventes</h1>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Revenu généré par la vente de vouchers, basé sur les forfaits émis.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm font-medium text-slate-500">Revenu total</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">
            {formatFcfa(totalRevenueCents)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm font-medium text-slate-500">Revenu aujourd&apos;hui</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">
            {formatFcfa(todayRevenueCents)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm font-medium text-slate-500">Ventes / Commissions</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">
            {sales.length}{" "}
            <span className="text-sm font-normal text-slate-400">
              ({formatFcfa(totalCommissionCents)} en commissions)
            </span>
          </p>
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Voucher</th>
              <th className="px-4 py-3 font-medium">Forfait</th>
              <th className="px-4 py-3 font-medium">Prix</th>
              <th className="px-4 py-3 font-medium">Statut</th>
              <th className="px-4 py-3 font-medium">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sales.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  Aucune vente pour le moment.
                </td>
              </tr>
            )}
            {sales.map((s) => (
              <tr key={s.id}>
                <td className="px-4 py-3 font-medium text-slate-900">
                  {s.username}
                </td>
                <td className="px-4 py-3 text-slate-600">{s.packageName}</td>
                <td className="px-4 py-3 font-medium text-emerald-700">
                  {formatFcfa(s.priceCents)}
                </td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                    {s.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-500">
                  {formatDate(s.createdAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
