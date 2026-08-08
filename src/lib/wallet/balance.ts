// Solde du portefeuille — module « plain », VOLONTAIREMENT sans "use server".
//
// POURQUOI CE FICHIER EXISTE : cette fonction vivait dans wallet/actions.ts,
// qui porte "use server" — donc chacune de ses fonctions exportées est un
// endpoint HTTP appelable. Celle-ci prend un `orgId` en paramètre et n'avait
// aucune vérification de session : elle rendait le solde de N'IMPORTE QUELLE
// organisation à qui savait l'appeler. Ses appelants réels (facturation,
// auto-setup, accès distant) sont tous du code serveur qui possède déjà la
// session ; ils n'ont jamais eu besoin du mécanisme de server action.
//
// La règle qui en découle : une fonction qui reçoit un identifiant de tenant
// EN PARAMÈTRE ne doit jamais être exportée depuis un module "use server".

import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { walletTransactions } from "@/lib/db/schema";

/**
 * Solde en FCFA : somme des dépôts confirmés moins les débits.
 *
 * `orgId` est une donnée de confiance — l'appelant doit l'avoir tirée d'une
 * session vérifiée, jamais d'une entrée client.
 */
export async function getWalletBalanceCents(orgId: string) {
  const db = getDb();
  const rows = await db
    .select({ type: walletTransactions.type, amountCents: walletTransactions.amountCents })
    .from(walletTransactions)
    .where(and(eq(walletTransactions.orgId, orgId), eq(walletTransactions.status, "completed")));

  return rows.reduce(
    (sum, r) => sum + (r.type === "topup" ? r.amountCents : -r.amountCents),
    0,
  );
}
