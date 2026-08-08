// Confirmation d'une recharge Safecoin — module « plain », VOLONTAIREMENT sans
// "use server".
//
// POURQUOI CE FICHIER EXISTE : même défaut que son équivalent portefeuille.
// Cette fonction vivait dans safecoin/actions.ts ("use server") et était donc
// un endpoint HTTP appelable sans authentification, qui créditait un compte
// Safecoin à qui connaissait une référence de paiement. Son seul appelant
// légitime est le webhook GeniusPay signé.

import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";

/**
 * Confirme un dépôt UNE SEULE FOIS après le webhook GeniusPay signé.
 *
 * Le crédit du solde et le passage de l'écriture en « completed » se font dans
 * UNE SEULE requête : l'entrée n'est créditée que si elle était encore
 * « pending », donc un rejeu du webhook ne crédite jamais deux fois.
 */
export async function completeSafecoinTopupByReference(
  paymentReference: string,
): Promise<boolean> {
  if (!paymentReference) return false;
  const db = getDb();
  const result = await db.execute(sql`
    WITH completed AS (
      UPDATE safecoin_ledger
      SET status = 'completed', note = 'Recharge Safecoin confirmée par GeniusPay'
      WHERE payment_reference = ${paymentReference}
        AND entry_type = 'topup'
        AND status = 'pending'
      RETURNING account_id, amount_sc_cents
    ), updated AS (
      UPDATE safecoin_accounts account
      SET balance_sc_cents = account.balance_sc_cents + completed.amount_sc_cents,
          updated_at = now()
      FROM completed
      WHERE account.id = completed.account_id
      RETURNING account.id
    )
    SELECT EXISTS (SELECT 1 FROM updated) AS completed
  `);
  const row = (result.rows?.[0] ?? {}) as { completed?: boolean };
  if (!row.completed) return false;
  revalidatePath("/admin/billing");
  return true;
}
