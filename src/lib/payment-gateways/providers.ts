export const PROVIDERS = ["paystack", "genius_pay"] as const;
export type Provider = (typeof PROVIDERS)[number];
