// Construit le client GeniusPay (nom, e-mail, téléphone, pays) à partir de la
// fiche utilisateur. GeniusPay et ses partenaires de paiement exigent ces
// informations sur CHAQUE transaction (conformité). Les flux portefeuille /
// Safecoin les collectent déjà au formulaire ; les flux auth (auto-setup,
// accès distant, provision par agent) n'avaient que nom + e-mail et oubliaient
// le téléphone — d'où le signalement du partenaire. Ce helper centralise la
// lecture pour qu'aucun appelant ne reparte avec un client incomplet.
// Module serveur uniquement (accès base).

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import type { GeniusPayCustomer } from "./phone";

/**
 * Client GeniusPay complet pour un utilisateur connecté, ou undefined si
 * l'id est absent / introuvable. Le téléphone stocké est LOCAL (`phone`) avec
 * l'indicatif à part (`phoneDialCode`, ex. "+225") : on les concatène pour
 * l'international (formatGeniusPayPhone normalisera le « + »). `country` est
 * l'ISO2 saisi à l'inscription.
 */
export async function getUserGeniusCustomer(
  userId: string | null | undefined,
): Promise<GeniusPayCustomer | undefined> {
  if (!userId) return undefined;
  const [u] = await getDb()
    .select({
      name: users.name,
      email: users.email,
      phone: users.phone,
      phoneDialCode: users.phoneDialCode,
      country: users.country,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!u) return undefined;
  const phone = u.phone ? `${u.phoneDialCode ?? ""}${u.phone}` : undefined;
  return {
    ...(u.name ? { name: u.name } : {}),
    ...(u.email ? { email: u.email } : {}),
    ...(phone ? { phone } : {}),
    ...(u.country ? { country: u.country } : {}),
  };
}
