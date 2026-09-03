import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { getSession, isSuperAdmin } from "@/lib/auth/session";
import { notFound } from "next/navigation";
import ConversionView from "./ConversionView";
import type { ConversionDay, PendingPayment } from "./conversion-data";

// Tableau de bord « Conversion paiement » : entonnoir des commandes du portail
// captif (portal_orders) — combien atteignent le checkout et combien paient
// vraiment, par jour.
//
// Catégories (mutuellement exclusives) :
//   • Payé            = status 'fulfilled'
//   • Paiement engagé = non-payé AVEC payment_reference (client arrivé au
//     paiement mais non finalisé → abandon au checkout / expiration)
//   • Perdu avant     = non-payé SANS référence (n'a jamais choisi de moyen)
//
// La présentation vit dans ConversionView : cette page ne fait que lire.

export const dynamic = "force-dynamic";

type Row = ConversionDay & { revenue_cents: number };

export default async function ConversionPage() {
  const session = await getSession();
  if (!session) notFound();

  const db = getDb();
  // Superadmin : agrège toutes les orgs ; admin : la sienne.
  const orgFilter = isSuperAdmin(session.role) ? sql`true` : sql`org_id = ${session.orgId}`;

  const daily = (
    await db.execute(sql`
      select to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as day,
        count(*) filter (where status = 'fulfilled')::int as paid,
        count(*) filter (where status <> 'fulfilled' and payment_reference is not null)::int as reached,
        count(*) filter (where status <> 'fulfilled' and payment_reference is null)::int as abandoned,
        count(*)::int as total,
        coalesce(sum(price_cents) filter (where status = 'fulfilled'), 0)::int as revenue_cents
      from portal_orders
      where ${orgFilter} and created_at > now() - interval '14 days'
      group by 1 order by 1 desc
    `)
  ).rows as unknown as Row[];

  // Les ventes ne montrent que les paiements confirmés. Cette liste distincte
  // rend visibles les références GeniusPay encore à vérifier sans les compter
  // à tort comme revenu.
  const pendingPayments = (
    await db.execute(sql`
      select id, phone, profile_name, price_cents, status, payment_reference,
        failure_reason, created_at
      from portal_orders
      where ${orgFilter}
        and status <> 'fulfilled'
        and payment_reference is not null
        and created_at > now() - interval '14 days'
      order by created_at desc
      limit 25
    `)
  ).rows as unknown as PendingPayment[];

  const sum = daily.reduce(
    (a, r) => ({
      paid: a.paid + r.paid,
      reached: a.reached + r.reached,
      abandoned: a.abandoned + r.abandoned,
      total: a.total + r.total,
      revenue: a.revenue + r.revenue_cents,
    }),
    { paid: 0, reached: 0, abandoned: 0, total: 0, revenue: 0 },
  );
  return (
    <ConversionView
      daily={daily}
      sum={sum}
      pendingPayments={pendingPayments}
      allOrgs={isSuperAdmin(session.role)}
    />
  );
}
