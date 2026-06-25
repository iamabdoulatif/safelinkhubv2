export const PROVIDERS = ["africastalking", "twilio"] as const;
export type Provider = (typeof PROVIDERS)[number];
