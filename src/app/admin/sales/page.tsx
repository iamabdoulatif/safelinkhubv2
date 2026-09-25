import { getSession } from "@/lib/auth/session";
import { getPaidSales } from "@/lib/sales/paid-orders";
import { revenuParZone } from "@/lib/sales/par-zone";
import { salesCsv, summarizeSales } from "@/lib/sales/summary";
import { resolveRange } from "@/lib/dashboard/range";
import { getAdminDict } from "@/lib/i18n/admin";
import { getLocale } from "@/lib/i18n/server";
import SalesView from "./SalesView";

/* Cette page ne fait que CHERCHER les données et résoudre la période ; le rendu
 * vit dans SalesView. Uniquement l'argent encaissé par la passerelle : les
 * tickets créés en lot, importés ou vendus par un agent ne sont pas du revenu
 * en ligne. */
export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; page?: string }>;
}) {
  const [session, locale, dict, params] = await Promise.all([
    getSession(),
    getLocale(),
    getAdminDict(),
    searchParams,
  ]);
  const now = new Date();
  const range = resolveRange(params, now);
  const sales = session ? await getPaidSales(session.orgId, { from: range.from, to: range.to }) : [];

  // Export sans aller-retour serveur : un lien data: vers le CSV de la période.
  // BOM UTF-8 pour qu'Excel lise les accents.
  const csvHref = `data:text/csv;charset=utf-8,${encodeURIComponent(`﻿${salesCsv(sales)}`)}`;

  return (
    <SalesView
      t={dict.finance.sales}
      locale={locale}
      sales={sales}
      summary={summarizeSales(sales, range, now)}
      zones={revenuParZone(sales)}
      picker={{ from: range.fromParam, to: range.toParam, activePreset: range.activePreset }}
      page={Number(params.page) || 1}
      csvHref={csvHref}
    />
  );
}
