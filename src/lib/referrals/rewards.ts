// Barème et libellés du parrainage — module PUR, volontairement séparé de
// service.ts : celui-ci importe getDb (donc `pg`), et un composant client qui
// tirerait la base dans son bundle casse le build Next. Tout ce dont l'UI a
// besoin vit ici ; le service l'importe aussi, il n'y a qu'un seul barème.

import { SC_SCALE } from "@/lib/safecoin/constants";

/** Les trois étapes primées, et ce qu'elles rapportent AU PARRAIN. */
export type ReferralEvent = "signup" | "auto_setup" | "vpn_yearly";

/** Barème en Safecoins ENTIERS (le grand livre compte en sous-unités). */
export const REFERRAL_REWARD_SC: Record<ReferralEvent, number> = {
  // Le filleul s'inscrit ET active son compte.
  signup: 5,
  // Le filleul réussit l'auto-setup d'un routeur.
  auto_setup: 10,
  // Le filleul achète un accès distant d'un an.
  vpn_yearly: 8,
};

export const REFERRAL_EVENT_LABEL: Record<ReferralEvent, string> = {
  signup: "Inscription activée",
  auto_setup: "Auto-setup d'un routeur",
  vpn_yearly: "Accès distant 1 an",
};

export function referralRewardScCents(event: ReferralEvent): number {
  return REFERRAL_REWARD_SC[event] * SC_SCALE;
}

/** Normalise une saisie utilisateur (minuscules, espaces, tirets collés). */
export function normalizeReferralCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}
