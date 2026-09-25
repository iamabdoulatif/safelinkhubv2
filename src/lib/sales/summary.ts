import { toParam } from "@/lib/dashboard/range";

type Sale = { priceCents: number; commissionCents: number; createdAt: Date; packageName: string };

export type SalesSummary = {
  revenueCents: number;
  commissionCents: number;
  netCents: number;
  count: number;
  averageCents: number;
  todayCents: number;
  /** Un point par jour de la période, jours sans vente compris. */
  daily: { day: string; revenueCents: number; count: number }[];
  /** Forfaits, le plus rentable d'abord ; part en % entier du revenu. */
  byPackage: { name: string; count: number; revenueCents: number; part: number }[];
};

/**
 * Chiffres de la page Ventes. Fonction PURE : c'est de l'argent, elle se
 * vérifie sans base. Montants en FCFA entiers (les champs *Cents portent ce
 * nom pour des raisons historiques).
 */
export function summarizeSales(sales: Sale[], range: { from: Date; to: Date }, now = new Date()): SalesSummary {
  const revenueCents = sales.reduce((s, v) => s + v.priceCents, 0);
  const commissionCents = sales.reduce((s, v) => s + v.commissionCents, 0);
  const today = toParam(now);

  const daily = new Map<string, { day: string; revenueCents: number; count: number }>();
  for (let d = new Date(range.from); d <= range.to; d.setDate(d.getDate() + 1)) {
    const key = toParam(d);
    daily.set(key, { day: key, revenueCents: 0, count: 0 });
  }
  const packages = new Map<string, { name: string; count: number; revenueCents: number }>();
  let todayCents = 0;
  for (const s of sales) {
    const key = toParam(s.createdAt);
    const point = daily.get(key);
    if (point) {
      point.revenueCents += s.priceCents;
      point.count += 1;
    }
    if (key === today) todayCents += s.priceCents;
    const p = packages.get(s.packageName) ?? { name: s.packageName, count: 0, revenueCents: 0 };
    p.count += 1;
    p.revenueCents += s.priceCents;
    packages.set(s.packageName, p);
  }

  return {
    revenueCents,
    commissionCents,
    netCents: revenueCents - commissionCents,
    count: sales.length,
    averageCents: sales.length ? Math.round(revenueCents / sales.length) : 0,
    todayCents,
    daily: [...daily.values()],
    byPackage: [...packages.values()]
      .sort((a, b) => b.revenueCents - a.revenueCents)
      .map((p) => ({ ...p, part: revenueCents ? Math.round((p.revenueCents / revenueCents) * 100) : 0 })),
  };
}

/** Export CSV (séparateur « ; » : Excel en français l'ouvre sans assistant). */
export function salesCsv(
  sales: { createdAt: Date; username: string; routerName: string | null; packageName: string; priceCents: number; commissionCents: number }[],
): string {
  const cell = (v: string | number) => {
    const s = String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [["Date", "Ticket", "Zone", "Forfait", "Montant FCFA", "Commission FCFA"].join(";")];
  for (const s of sales) {
    lines.push(
      [s.createdAt.toISOString(), s.username, s.routerName ?? "", s.packageName, s.priceCents, s.commissionCents]
        .map(cell)
        .join(";"),
    );
  }
  return lines.join("\n");
}
