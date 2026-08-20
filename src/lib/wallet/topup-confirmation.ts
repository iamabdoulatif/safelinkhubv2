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
import { organizations, walletTransactions } from "@/lib/db/schema";
import { resellerExpiryFrom } from "@/lib/billing/reseller";

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
    .returning({ orgId: walletTransactions.orgId, purpose: walletTransactions.purpose });
  if (!row) return false;

  // Le pack revendeur est un dépôt comme un autre — le crédit vient d'être
  // porté au portefeuille par la ligne ci-dessus. Ce qu'il ajoute, c'est
  // l'OUVERTURE du tarif remisé, qui n'a lieu qu'ici : c'est le seul endroit du
  // code où un paiement est réellement constaté.
  //
  // Le quota repart de zéro à chaque activation : payer un nouveau pack rouvre
  // 50 installations, sans reporter le reliquat du précédent. C'est la règle
  // « 50 par an, renouvelé au paiement ».
  if (row.purpose === "reseller_pack") {
    const activatedAt = new Date();
    await db
      .update(organizations)
      .set({
        accountType: "reseller",
        resellerActivatedAt: activatedAt,
        resellerExpiresAt: resellerExpiryFrom(activatedAt),
        resellerQuotaUsed: 0,
      })
      .where(eq(organizations.id, row.orgId));
    revalidatePath("/admin");
  }

  revalidatePath("/admin/billing");
  return true;
}
