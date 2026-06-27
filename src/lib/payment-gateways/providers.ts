export const PROVIDERS = ["paystack", "genius_pay", "wassoya"] as const;
export type Provider = (typeof PROVIDERS)[number];
