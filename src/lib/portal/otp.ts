// Vérification OTP (SMS) du numéro du client au portail captif, en amont du
// paiement. Le préfixe pays est déduit de l'org (pays où opère le MikroTik) :
// le client ne saisit que son numéro local, on reconstitue l'international.
// Module serveur uniquement (crypto Node).

import { createHash, randomInt } from "node:crypto";
import { findCountry } from "@/lib/intl/countries";

/** Validité du code envoyé par SMS. */
export const OTP_TTL_MS = 5 * 60 * 1000;
// NB : une vérification réussie est mémorisée SANS limite de durée (par org +
// numéro) — le client ne reçoit un code OTP qu'au premier achat ; les achats
// suivants vont droit au paiement et seul le SMS du ticket est envoyé.
/** Anti-spam : délai minimal entre deux envois de code pour un même numéro. */
export const OTP_RESEND_COOLDOWN_MS = 40 * 1000;
/** Nombre d'essais de code autorisés avant de devoir en redemander un. */
export const OTP_MAX_ATTEMPTS = 5;

/** Code numérique à 6 chiffres (tirage cryptographique, sans biais). */
export function generateOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** Empreinte du code, liée à l'org et au numéro (jamais stocké en clair). */
export function hashOtpCode(orgId: string, phone: string, code: string): string {
  return createHash("sha256").update(`${orgId}:${phone}:${code}`).digest("hex");
}

/**
 * Indicatif d'appel de l'org (pays où opère le routeur) : la valeur saisie à
 * l'inscription (`phoneDialCode`, ex. "+225") prime, sinon on la déduit du
 * pays ISO2. "" si inconnu → le portail n'affiche pas de préfixe et le client
 * saisit son numéro complet.
 */
export function resolveDialCode(
  phoneDialCode: string | null,
  country: string | null,
): string {
  if (phoneDialCode && phoneDialCode.trim()) return phoneDialCode.trim();
  if (country) {
    const c = findCountry(country);
    if (c) return c.dialCode;
  }
  return "";
}

/**
 * Reconstruit le numéro international (chiffres uniquement, sans +) à partir du
 * numéro local saisi et de l'indicatif de l'org. Si le numéro saisi contient
 * déjà l'indicatif, on ne le double pas. Sans indicatif connu, on renvoie le
 * numéro tel quel.
 */
export function toInternational(localRaw: string, dialCode: string): string {
  const local = localRaw.replace(/[^0-9]/g, "");
  const dial = dialCode.replace(/[^0-9]/g, "");
  if (!dial) return local;
  if (!local) return "";
  if (local.startsWith(dial)) return local;
  return dial + local;
}

/** Version masquée d'un numéro international pour l'afficher (garde 2 chiffres). */
export function maskPhone(intl: string): string {
  if (intl.length < 4) return intl;
  return `••• ${intl.slice(-2)}`;
}
