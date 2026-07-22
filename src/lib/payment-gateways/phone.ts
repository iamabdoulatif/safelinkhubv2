/**
 * Format attendu par GeniusPay pour le routage pays/opérateur.
 *
 * GeniusPay documente un numéro international avec le signe « + ». Sans lui,
 * son auto-détection peut attribuer le mauvais pays (observé en production :
 * un numéro ivoirien 225… classé TN).
 */
export function formatGeniusPayPhone(raw: string): string {
  const digits = raw.trim().replace(/[^0-9]/g, "");
  if (!digits) return "";
  return digits.startsWith("00") ? `+${digits.slice(2)}` : `+${digits}`;
}

export type GeniusPayCustomer = {
  name?: string;
  email?: string;
  phone?: string;
  country?: string;
};

/** Normalise le client sans perdre le pays ISO2 explicitement fourni. */
export function formatGeniusPayCustomer(
  customer: GeniusPayCustomer | undefined,
): GeniusPayCustomer | undefined {
  if (!customer) return undefined;
  const phone = customer.phone ? formatGeniusPayPhone(customer.phone) : "";
  return {
    ...customer,
    ...(phone ? { phone } : {}),
  };
}
