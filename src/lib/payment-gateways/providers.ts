export const PROVIDERS = ["paystack", "genius_pay", "pawapay"] as const;
export type Provider = (typeof PROVIDERS)[number];
