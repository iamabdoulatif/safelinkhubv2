import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { portalOrders, vouchers } from "@/lib/db/schema";
import { sendOrgSms } from "@/lib/sms/send";

/**
 * Prévenir le client d'un code bridé puis suspendu — sur le numéro qui a
 * ACHETÉ le code au portail, seul numéro que la plateforme connaisse. Un code
 * vendu par un agent n'en a pas : on ne prétend pas l'avoir joint, on le DIT
 * (voir le journal « notice »), sans quoi le client se présenterait au guichet
 * sans savoir pourquoi son code est mort.
 */
export type Avis = { user: string; remaining: number; notified: boolean; phone: string | null };

export async function notifierClients(orgId: string, cibles: { user: string; remaining: number }[]): Promise<Avis[]> {
  if (cibles.length === 0) return [];
  const db = getDb();
  const avis: Avis[] = [];
  for (const cible of cibles) {
    let phone: string | null = null;
    let notified = false;
    try {
      const [ligne] = await db
        .select({ phone: portalOrders.phone })
        .from(portalOrders)
        .innerJoin(vouchers, eq(vouchers.id, portalOrders.voucherId))
        .where(and(eq(vouchers.username, cible.user), eq(vouchers.orgId, orgId)))
        .limit(1);
      phone = ligne?.phone ?? null;
      if (phone) {
        const contenu =
          cible.remaining > 0
            ? `Votre code ${cible.user} telecharge trop vite : debit reduit. Encore ${cible.remaining} depassement(s) et il sera suspendu definitivement.`
            : `Votre code ${cible.user} est suspendu definitivement apres 10 depassements de telechargement.`;
        const res = await sendOrgSms({ orgId, to: phone, content: contenu });
        notified = Boolean(res) && !("error" in res && res.error);
      }
    } catch {
      /* best-effort : l'échec d'un SMS n'annule ni le bridage ni la suspension */
    }
    avis.push({ user: cible.user, remaining: cible.remaining, notified, phone });
  }
  return avis;
}
