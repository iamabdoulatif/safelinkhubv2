export const PROVIDERS = ["wassoya"] as const;
export type Provider = (typeof PROVIDERS)[number];
