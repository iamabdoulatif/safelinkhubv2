// Porte KYC sur l'argent qui entre. Module « plain » (pas de "use server") :
// importable par les server actions comme par les server components.
//
// LE DÉCLENCHEUR VISÉ est l'encaissement du gain par l'opérateur — cette
// fonction n'existe pas encore dans le produit. En attendant, la porte se
// pose là où l'argent transite RÉELLEMENT aujourd'hui : les rechargements du
// portefeuille. Quand le retrait des gains existera, il appellera
// `decideKycGate` avec le cumul retiré ; la règle n'aura pas à être réécrite.

import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { kycVerifications, walletTransactions } from "@/lib/db/schema";

/** Seuil au-delà duquel la vérification d'identité devient obligatoire.
 *  Exprimé en FCFA entiers — la colonne `amount_cents` du portefeuille porte
 *  un nom hérité mais stocke bien des FCFA (voir `amountFcfa: amountCents`
 *  dans wallet/actions.ts). */
export const KYC_THRESHOLD_FCFA = 100_000;

export type KycGateDecision =
  | { ok: true }
  | { ok: false; reason: "kyc_required"; cumulFcfa: number; message: string };

/**
 * Décision pure — testable sans base.
 *
 * Le cumul compté inclut LE DÉPÔT EN COURS : sinon la transaction qui franchit
 * le seuil passerait toujours, et l'organisation serait bloquée seulement au
 * dépôt suivant. Un seuil que l'on dépasse une fois gratuitement n'en est pas
 * un.
 *
 * Seul « approved » ouvre la porte. Un dossier en cours d'examen ne suffit
 * pas : sinon il suffirait de soumettre n'importe quoi pour continuer.
 */
export function decideKycGate({
  cumulPrecedentFcfa,
  montantFcfa,
  kycStatus,
}: {
  cumulPrecedentFcfa: number;
  montantFcfa: number;
  kycStatus: string | null;
}): KycGateDecision {
  const cumulFcfa = cumulPrecedentFcfa + montantFcfa;
  if (cumulFcfa <= KYC_THRESHOLD_FCFA) return { ok: true };
  if (kycStatus === "approved") return { ok: true };

  const seuil = KYC_THRESHOLD_FCFA.toLocaleString("fr-FR");
  return {
    ok: false,
    reason: "kyc_required",
    cumulFcfa,
    message:
      kycStatus === "under_review" || kycStatus === "documents_sent"
        ? `Votre vérification d'identité est en cours d'examen. Au-delà de ${seuil} FCFA cumulés, elle doit être validée avant tout nouveau rechargement.`
        : `Au-delà de ${seuil} FCFA cumulés, la vérification d'identité est obligatoire. Ouvrez « Vérification » dans votre espace pour la lancer.`,
  };
}

/** Somme des rechargements CONFIRMÉS de l'organisation, en FCFA. */
export async function getLifetimeTopupFcfa(orgId: string): Promise<number> {
  const [row] = await getDb()
    .select({ total: sql<number>`coalesce(sum(${walletTransactions.amountCents}), 0)`.mapWith(Number) })
    .from(walletTransactions)
    .where(
      and(
        eq(walletTransactions.orgId, orgId),
        eq(walletTransactions.type, "topup"),
        eq(walletTransactions.status, "completed"),
      ),
    );
  return row?.total ?? 0;
}

/**
 * Garde des rechargements. `orgId` est une donnée de confiance — l'appelant
 * doit l'avoir tirée d'une session vérifiée, jamais d'une entrée client.
 *
 * `dejaCompteFcfa` retranche ce que la ligne éditée pèse DÉJÀ dans le cumul :
 * modifier un dépôt confirmé de 50 000 en 60 000 ne doit compter que le
 * nouveau montant, pas 110 000.
 */
export async function kycTopupGate(
  orgId: string,
  montantFcfa: number,
  dejaCompteFcfa = 0,
): Promise<KycGateDecision> {
  const cumulPrecedentFcfa = (await getLifetimeTopupFcfa(orgId)) - dejaCompteFcfa;
  // Pas encore au seuil : inutile d'aller lire le dossier KYC.
  if (cumulPrecedentFcfa + montantFcfa <= KYC_THRESHOLD_FCFA) return { ok: true };

  const [dossier] = await getDb()
    .select({ status: kycVerifications.status })
    .from(kycVerifications)
    .where(eq(kycVerifications.orgId, orgId))
    .limit(1);

  return decideKycGate({
    cumulPrecedentFcfa,
    montantFcfa,
    kycStatus: dossier?.status ?? null,
  });
}
