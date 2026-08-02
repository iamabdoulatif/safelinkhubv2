import { NextRequest } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { sendConversionAlertEmail } from "@/lib/auth/email";

export const maxDuration = 60;

/**
 * Alerte quotidienne « conversion paiement en baisse » — déclenchée par le timer
 * systemd conversion-alert.timer (voir deploy/). Calcule, par organisation, le
 * taux de conversion des commandes du portail captif de LA VEILLE et envoie un
 * e-mail aux admins vérifiés si ce taux tombe sous le seuil (défaut 20%). On
 * n'alerte qu'au-delà d'un volume minimum (défaut 8 commandes/jour) pour éviter
 * les faux positifs d'un jour à faible trafic.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const threshold = Number(process.env.CONVERSION_ALERT_THRESHOLD ?? 20);
  const minOrders = Number(process.env.CONVERSION_ALERT_MIN_ORDERS ?? 8);
  const db = getDb();

  // Agrégat par org sur la journée d'HIER (jour calendaire du serveur, UTC ≈
  // Afrique/Abidjan). Seuls les orgs avec assez de volume sont évalués.
  const rows = (
    await db.execute(sql`
      select o.org_id,
        count(*) filter (where o.status = 'fulfilled')::int as paid,
        count(*)::int as total
      from portal_orders o
      where o.created_at >= (current_date - interval '1 day')
        and o.created_at < current_date
      group by o.org_id
      having count(*) >= ${minOrders}
    `)
  ).rows as unknown as { org_id: string; paid: number; total: number }[];

  const alerted: { orgId: string; rate: number; recipients: number }[] = [];

  for (const r of rows) {
    const rate = r.total > 0 ? Math.round((r.paid / r.total) * 100) : 0;
    if (rate >= threshold) continue;

    const recipients = await db
      .select({ email: users.email, name: users.name })
      .from(users)
      .where(and(eq(users.orgId, r.org_id), eq(users.emailVerified, true)));

    // Nom de l'org (une requête légère, réutilisée pour tous les destinataires).
    const orgRow = (
      await db.execute(sql`select name from organizations where id = ${r.org_id} limit 1`)
    ).rows as unknown as { name: string }[];
    const orgName = orgRow[0]?.name ?? "";

    let sent = 0;
    for (const u of recipients) {
      const ok = await sendConversionAlertEmail(u.email, u.name, {
        orgName,
        rate,
        threshold,
        paid: r.paid,
        total: r.total,
      });
      if (ok) sent += 1;
    }
    alerted.push({ orgId: r.org_id, rate, recipients: sent });
  }

  return Response.json({
    ok: true,
    threshold,
    minOrders,
    evaluated: rows.length,
    alerted,
  });
}
