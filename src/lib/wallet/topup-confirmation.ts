// Confirmation d'un dépôt portefeuille — module « plain », VOLONTAIREMENT sans
// "use server".
//
// POURQUOI CE FICHIER EXISTE : cette fonction vivait dans wallet/actions.ts,
// qui porte "use server". Elle était donc un endpoint HTTP appelable qui, sans
// aucune authentification, faisait passer un dépôt de « pending » à
// « completed » — autrement dit CRÉDITAIT DE L'ARGENT à qui connaissait une
// référence de paiement. Son seul appelant légitime est le webhook GeniusPay
// signé, qui tourne dans le même processus et peut simplement l'importer.

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { walletTransactions } from "@/lib/db/schema";

/**
 * Crédite un dépôt UNE SEULE FOIS, après validation du webhook GeniusPay.
 *
 * Idempotent par construction : le filtre `status = 'pending'` fait qu'un rejeu
 * ne met à jour aucune ligne et renvoie false.
 */
export async function completeWalletTopupByReference(paymentReference: string): Promise<boolean> {
  if (!paymentReference) return false;
  const db = getDb();
  const [row] = await db
    .update(walletTransactions)
    .set({ status: "completed", note: "Dépôt portefeuille confirmé par Genius Pay" })
    .where(
      and(
        eq(walletTransactions.type, "topup"),
        eq(walletTransactions.status, "pending"),
        eq(walletTransactions.paymentReference, paymentReference),
      ),
    )
    .returning({ orgId: walletTransactions.orgId });
  if (!row) return false;
  revalidatePath("/admin/billing");
  return true;
}
