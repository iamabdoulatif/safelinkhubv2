// Compte revendeur : tarif d'installation remisé, contre un pack annuel payé
// d'avance. Module « plain » — importable côté client pour l'affichage, aucun
// accès base ici.
//
// L'ÉCONOMIE, pour qu'un futur lecteur ne la reconstitue pas de travers :
//
//   Le revendeur paie 40 000 FCFA. Cette somme lui revient INTÉGRALEMENT en
//   crédit libre sur son portefeuille (400 SC au taux de 100 FCFA/SC), et lui
//   ouvre 50 installations à 800 FCFA au lieu de 10 000 ou 15 000.
//
//   400 SC ÷ 8 SC par installation = exactement 50. Le pack n'est donc pas un
//   droit d'entrée : c'est un prépaiement dont le montant finance très
//   précisément le quota. C'est voulu, et c'est ce qui rend l'arithmétique
//   lisible pour le revendeur — il paie 40 000, il pose 50 routeurs.
//
//   La remise atteint 92 %. Elle a été arbitrée en connaissance de cause.

export const RESELLER_PACK_FCFA = 40000;

/** Installations remisées ouvertes par un pack, sur douze mois. */
export const RESELLER_QUOTA = 50;

/** Prix FORFAITAIRE d'une installation pour un revendeur : le matériel
 *  compatible conteneur ne coûte pas plus cher que le matériel léger, à la
 *  différence du tarif public. */
export const RESELLER_SETUP_FEE_CENTS = 800;

export const RESELLER_PACK_MONTHS = 12;

export type AccountType = "user" | "reseller";

/** Ce que la base sait d'une organisation revendeur. */
export type ResellerRecord = {
  accountType: string | null;
  /** Null tant que le paiement n'est pas confirmé. */
  resellerActivatedAt: Date | null;
  resellerExpiresAt: Date | null;
  resellerQuotaUsed: number | null;
};

export type ResellerState = {
  /** Le compte a DEMANDÉ le statut revendeur. */
  requested: boolean;
  /** Paiement encaissé, pack non expiré, quota non épuisé. */
  active: boolean;
  /** Demandé mais jamais payé — aucune remise. */
  pendingPayment: boolean;
  expired: boolean;
  quotaTotal: number;
  quotaUsed: number;
  quotaLeft: number;
  expiresAt: Date | null;
};

export function resellerState(row: ResellerRecord | null, now = new Date()): ResellerState {
  const requested = row?.accountType === "reseller";
  const used = Math.max(0, row?.resellerQuotaUsed ?? 0);
  const left = Math.max(0, RESELLER_QUOTA - used);
  const paid = Boolean(row?.resellerActivatedAt);
  const expiresAt = row?.resellerExpiresAt ?? null;
  const expired = paid && expiresAt !== null && expiresAt.getTime() <= now.getTime();

  return {
    requested,
    // Le quota épuisé ne « désactive » pas le compte — il reste revendeur
    // jusqu'à l'échéance — mais il ne donne plus droit au tarif remisé.
    active: requested && paid && !expired,
    pendingPayment: requested && !paid,
    expired,
    quotaTotal: RESELLER_QUOTA,
    quotaUsed: used,
    quotaLeft: left,
    expiresAt,
  };
}

/**
 * Prix d'une installation pour cette organisation.
 *
 * Le tarif remisé exige TROIS conditions réunies : statut demandé, paiement
 * encaissé, quota restant. Une seule qui manque et le tarif public s'applique
 * — c'est la garantie « aucune remise sans paiement ».
 */
export function setupFeeCentsFor(
  state: ResellerState,
  supportsContainers: boolean,
  publicFee: (supportsContainers: boolean) => number,
): number {
  if (state.active && state.quotaLeft > 0) return RESELLER_SETUP_FEE_CENTS;
  return publicFee(supportsContainers);
}

/** Échéance d'un pack activé maintenant. */
export function resellerExpiryFrom(activatedAt: Date): Date {
  const d = new Date(activatedAt);
  d.setMonth(d.getMonth() + RESELLER_PACK_MONTHS);
  return d;
}
