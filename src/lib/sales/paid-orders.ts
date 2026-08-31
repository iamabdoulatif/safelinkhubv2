// Source unique des « ventes » de l'admin : seules les commandes du PORTAIL
// CAPTIF réellement encaissées par l'agrégateur de paiement (GeniusPay).
//
// Les tickets créés en lot, importés depuis un MikroTik, vendus par un agent
// ou générés en roaming ne passent par aucune passerelle : les compter comme
// du chiffre d'affaires gonflait le brut avec des codes jamais payés en ligne.
//
// `paid` → paiement confirmé (webhook ou poll GeniusPay) ; `fulfilling` et
// `fulfilled` → suite du même paiement (création du user hotspot). `pending`,
// `payment_initiating` et `failed` = aucun encaissement.
import { and, desc, eq, gte, inArray, lte, type SQL } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { packages, portalOrders, routers, vouchers } from "@/lib/db/schema";

export const PAID_ORDER_STATUSES = ["paid", "fulfilling", "fulfilled"] as const;

export type PaidSale = {
  id: string;
  /** Code du ticket livré ; retombe sur le numéro du client si l'honneur a échoué. */
  username: string;
  packageName: string;
  priceCents: number;
  commissionCents: number;
  status: string;
  createdAt: Date;
  /* La zone Wi-Fi d'où vient la vente. `router_id` est renseignée sur chaque
     commande du portail depuis toujours ; elle n'était simplement jamais lue. */
  routerId: string | null;
  routerName: string | null;
};

/** Ventes encaissées d'une org, les plus récentes d'abord. `range` optionnel. */
export async function getPaidSales(
  orgId: string,
  range?: { from: Date; to: Date },
): Promise<PaidSale[]> {
  const db = getDb();

  const filters: SQL[] = [
    eq(portalOrders.orgId, orgId),
    inArray(portalOrders.status, [...PAID_ORDER_STATUSES]),
  ];
  if (range) {
    filters.push(gte(portalOrders.createdAt, range.from));
    filters.push(lte(portalOrders.createdAt, range.to));
  }

  const rows = await db
    .select({
      id: portalOrders.id,
      phone: portalOrders.phone,
      profileName: portalOrders.profileName,
      status: portalOrders.status,
      createdAt: portalOrders.createdAt,
      orderPriceCents: portalOrders.priceCents,
      username: vouchers.username,
      packageName: packages.name,
      packagePriceCents: packages.priceCents,
      commissionCents: packages.commissionCents,
      routerId: portalOrders.routerId,
      routerName: routers.name,
    })
    .from(portalOrders)
    // Jointures externes : un forfait supprimé ou un ticket non encore honoré
    // ne doit pas faire disparaître un paiement déjà encaissé.
    .leftJoin(packages, eq(portalOrders.packageId, packages.id))
    .leftJoin(vouchers, eq(portalOrders.voucherId, vouchers.id))
    // Externe elle aussi : un routeur retiré du parc ne doit pas faire
    // disparaître les ventes qu'il a encaissées.
    .leftJoin(routers, eq(portalOrders.routerId, routers.id))
    .where(and(...filters))
    .orderBy(desc(portalOrders.createdAt));

  // Le prix figé sur la commande fait foi (le forfait a pu changer de tarif
  // depuis) ; on retombe sur le tarif courant pour les commandes antérieures
  // au snapshot de prix.
  return rows.map((r) => ({
    id: r.id,
    username: r.username ?? r.phone,
    packageName: r.packageName ?? r.profileName ?? "Forfait",
    priceCents: r.orderPriceCents ?? r.packagePriceCents ?? 0,
    commissionCents: r.commissionCents ?? 0,
    status: r.status,
    createdAt: r.createdAt,
    routerId: r.routerId ?? null,
    routerName: r.routerName ?? null,
  }));
}
