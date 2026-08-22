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

/** Palier d'avertissement : on prévient AVANT de bloquer. Découvrir la règle
 *  au moment du refus, c'est un rechargement raté et un appel au support. */
export const KYC_WARNING_FCFA = 80_000;

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

export type KycThresholdNotice = {
  ton: "avertissement" | "blocage";
  titre: string;
  message: string;
};

/**
 * Bandeau à afficher sur la facturation — décision pure, testable sans base.
 *
 * Rend `null` quand il n'y a rien à dire : sous le palier d'avertissement, ou
 * dossier déjà validé. Un bandeau permanent finit par ne plus être lu.
 */
export function kycThresholdNotice({
  cumulFcfa,
  kycStatus,
}: {
  cumulFcfa: number;
  kycStatus: string | null;
}): KycThresholdNotice | null {
  if (kycStatus === "approved") return null;
  if (cumulFcfa < KYC_WARNING_FCFA) return null;

  const seuil = KYC_THRESHOLD_FCFA.toLocaleString("fr-FR");
  const cumul = cumulFcfa.toLocaleString("fr-FR");
  const enExamen = kycStatus === "under_review" || kycStatus === "documents_sent";

  if (cumulFcfa > KYC_THRESHOLD_FCFA) {
    return {
      ton: "blocage",
      titre: "Rechargements suspendus",
      message: enExamen
        ? `Vous avez rechargé ${cumul} FCFA, au-delà du seuil de ${seuil} FCFA. Votre vérification d'identité est en cours d'examen : les rechargements reprendront dès qu'elle sera validée.`
        : `Vous avez rechargé ${cumul} FCFA, au-delà du seuil de ${seuil} FCFA. Validez votre identité pour pouvoir recharger à nouveau.`,
    };
  }

  const restant = (KYC_THRESHOLD_FCFA - cumulFcfa).toLocaleString("fr-FR");
  return {
    ton: "avertissement",
    titre: "Vérification d'identité bientôt requise",
    message: enExamen
      ? `Vous avez rechargé ${cumul} FCFA. Au-delà de ${seuil} FCFA, la vérification doit être validée — la vôtre est en cours d'examen.`
      : `Vous avez rechargé ${cumul} FCFA. Il vous reste ${restant} FCFA avant que la vérification d'identité ne devienne obligatoire. Lancez-la dès maintenant pour ne pas être interrompu.`,
  };
}

/** Statut du dossier KYC de l'organisation, ou null s'il n'existe pas. */
export async function getKycStatus(orgId: string): Promise<string | null> {
  const [row] = await getDb()
    .select({ status: kycVerifications.status })
    .from(kycVerifications)
    .where(eq(kycVerifications.orgId, orgId))
    .limit(1);
  return row?.status ?? null;
}
