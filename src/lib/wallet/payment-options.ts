import { COUNTRIES, type Country } from "@/lib/intl/countries";

export const WALLET_PAYMENT_METHODS = [
  { id: "wave", label: "Wave", hint: "Redirection sécurisée Wave" },
  { id: "orange_money", label: "Orange Money", hint: "Paiement mobile Orange" },
  { id: "mtn_money", label: "MTN MoMo", hint: "Paiement mobile MTN" },
  { id: "moov_money", label: "Moov Money", hint: "Paiement mobile Moov" },
  { id: "card", label: "Carte bancaire", hint: "Visa / Mastercard" },
] as const;

export type WalletPaymentMethod = (typeof WALLET_PAYMENT_METHODS)[number]["id"];

/**
 * Passerelles affichées dans le parcours portefeuille. Genius Pay est la
 * seule passerelle plateforme réellement branchée pour l'instant ; les deux
 * autres restent visibles pour rendre la feuille de route explicite sans
 * laisser croire qu'un paiement a été activé.
 */
export const WALLET_PAYMENT_GATEWAYS = [
  {
    id: "genius_pay",
    label: "Genius Pay",
    status: "available",
    description: "Wave, Orange Money, MTN MoMo, Moov Money et carte",
  },
  {
    id: "paystack",
    label: "Paystack",
    status: "coming_soon",
    description: "Activation prochaine selon le pays",
  },
  {
    id: "pawapay",
    label: "PawaPay",
    status: "coming_soon",
    description: "Activation prochaine selon le pays",
  },
] as const;

export function isWalletPaymentMethod(value: string): value is WalletPaymentMethod {
  return WALLET_PAYMENT_METHODS.some((method) => method.id === value);
}

export function getWalletPaymentMethodLabel(value: string) {
  return WALLET_PAYMENT_METHODS.find((method) => method.id === value)?.label ?? value;
}

/** Pays disponibles dans le catalogue SafeLinkHub pour un paiement XOF. */
export function getWalletEligibleCountries(): Country[] {
  return COUNTRIES.filter((country) => country.iso2 !== "XX");
}

export function isWalletEligibleCountry(value: string): boolean {
  return getWalletEligibleCountries().some((country) => country.iso2 === value);
}
