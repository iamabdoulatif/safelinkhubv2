export const PROVIDERS = ["paystack", "genius_pay", "pawapay", "saspay"] as const;
export type Provider = (typeof PROVIDERS)[number];
