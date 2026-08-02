import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { getSession, isSuperAdmin } from "@/lib/auth/session";
import { notFound } from "next/navigation";

// Tableau de bord « Conversion paiement » : entonnoir des commandes du portail
// captif (portal_orders) — combien atteignent le checkout et combien paient
// vraiment, par jour. Sert à mesurer l'effet du correctif « ouvrir dans le vrai
// navigateur » sur l'abandon en portail captif.
//
// Catégories (mutuellement exclusives) :
//   • Payé            = status 'fulfilled'
//   • Checkout atteint = non-payé AVEC payment_reference (client arrivé au
//     paiement mais non finalisé → abandon au checkout / expiration)
//   • Abandonné avant  = non-payé SANS référence (n'a jamais choisi de moyen)

export const dynamic = "force-dynamic";

type Row = {
  day: string;
  paid: number;
  reached: number;
  abandoned: number;
  total: number;
  revenue_cents: number;
};

function fmtDay(d: string) {
  const date = new Date(d);
  return date.toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit" });
}
// priceCents stocke le montant EN FCFA directement (voir pay/route.ts :
// amountFcfa = order.priceCents), pas des centimes — donc pas de division.
function fcfa(amount: number) {
  return `${Math.round(amount).toLocaleString("fr-FR")} F`;
}

function Bar({ paid, reached, abandoned }: { paid: number; reached: number; abandoned: number }) {
  const t = Math.max(1, paid + reached + abandoned);
  const seg = (n: number, color: string) =>
    n > 0 ? <span style={{ width: `${(n / t) * 100}%` }} className={`block h-full ${color}`} /> : null;
  return (
    <span className="flex h-3 w-full overflow-hidden border border-line bg-paper" title={`${paid} payé · ${reached} checkout · ${abandoned} abandon`}>
      {seg(paid, "bg-ok")}
      {seg(reached, "bg-warn")}
      {seg(abandoned, "bg-err")}
    </span>
  );
}

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
  const convRate = sum.total > 0 ? Math.round((sum.paid / sum.total) * 100) : 0;
  const checkoutRate = sum.total > 0 ? Math.round(((sum.paid + sum.reached) / sum.total) * 100) : 0;

  return (
    <div className="mx-auto max-w-5xl">
      <div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
          Conversion paiement
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          Entonnoir des commandes du portail captif (14 derniers jours)
          {isSuperAdmin(session.role) ? " — toutes organisations" : ""}. Mesure l&apos;effet du
          correctif « ouvrir dans le vrai navigateur ».
        </p>
      </div>

      {/* Cartes de synthèse */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Payé", value: sum.paid, tone: "text-ok", sub: `${convRate}% des commandes` },
          { label: "Checkout atteint", value: sum.reached, tone: "text-warn", sub: "non finalisé" },
          { label: "Abandonné avant", value: sum.abandoned, tone: "text-err", sub: "sans checkout" },
          { label: "Revenu payé", value: fcfa(sum.revenue), tone: "text-ink", sub: `${sum.total} commandes` },
        ].map((c) => (
          <div key={c.label} className="border-2 border-line bg-paper p-4">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-wide text-ink-soft">{c.label}</p>
            <p className={`mt-1 font-display text-2xl font-extrabold tabular-nums ${c.tone}`}>{c.value}</p>
            <p className="mt-0.5 text-xs text-ink-soft">{c.sub}</p>
          </div>
        ))}
      </div>

      {/* Taux clés */}
      <div className="mt-3 flex flex-wrap gap-2 text-xs font-mono font-semibold uppercase">
        <span className="border border-ok px-2 py-1 text-ok">Taux de conversion {convRate}%</span>
        <span className="border border-warn px-2 py-1 text-warn">Atteinte du checkout {checkoutRate}%</span>
      </div>

      {/* Légende */}
      <div className="mt-5 flex flex-wrap items-center gap-4 text-xs text-ink-soft">
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 bg-ok" /> Payé</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 bg-warn" /> Checkout atteint, non finalisé</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 bg-err" /> Abandonné avant paiement</span>
      </div>

      {/* Table par jour */}
      <div className="mt-3 overflow-x-auto border-2 border-line bg-paper">
        <table className="w-full text-left text-sm">
          <thead className="border-b-2 border-line bg-clay">
            <tr className="font-mono text-[11px] font-semibold uppercase tracking-widest text-ink-soft">
              <th className="px-4 py-3">Jour</th>
              <th className="px-4 py-3">Répartition</th>
              <th className="px-4 py-3 text-right">Payé</th>
              <th className="px-4 py-3 text-right">Checkout</th>
              <th className="px-4 py-3 text-right">Abandon</th>
              <th className="px-4 py-3 text-right">Conv.</th>
            </tr>
          </thead>
          <tbody>
            {daily.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-ink-soft">
                  Aucune commande sur les 14 derniers jours.
                </td>
              </tr>
            ) : (
              daily.map((r) => {
                const conv = r.total > 0 ? Math.round((r.paid / r.total) * 100) : 0;
                return (
                  <tr key={r.day} className="border-b border-line-soft last:border-0 hover:bg-clay">
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-ink">{fmtDay(r.day)}</td>
                    <td className="px-4 py-3" style={{ minWidth: 160 }}>
                      <Bar paid={r.paid} reached={r.reached} abandoned={r.abandoned} />
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-ok">{r.paid}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-warn">{r.reached}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-err">{r.abandoned}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-bold text-ink">{conv}%</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-ink-soft">
        « Checkout atteint » = le client est arrivé jusqu&apos;au paiement (référence créée) mais n&apos;a
        pas finalisé. « Abandonné avant » = commande créée sans jamais choisir de moyen de paiement.
      </p>
    </div>
  );
}
