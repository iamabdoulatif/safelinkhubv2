// Plain shared module (no "use server") so this price table can be
// imported both by the server action in port-forward.ts and directly by
// client components (DirectAccessSection) to display prices — a "use
// server" file may only export async functions, so a plain object/type
// like this can't live there (see the "use server" comment in
// port-forward.ts for the bug this caused once already).

export type BillingPeriod = "monthly" | "quarterly" | "semiannual" | "yearly";

// Flat price per period regardless of service (WinBox/WebFig/SSH/MikHmon
// all cost the same) — FCFA, admin-set. Charged to the org's wallet (see
// lib/wallet/actions.ts) when an admin explicitly activates a plan through
// the authenticated enablePortForward action; NOT charged for the services
// auto-enabled right after install (autoEnablePostInstallAccess) since the
// customer never chose a plan for those.
export const PERIOD_PRICE_CENTS: Record<BillingPeriod, number> = {
  monthly: 500,
  quarterly: 1300,
  semiannual: 2700,
  yearly: 5800,
};

export const BILLING_PERIOD_MONTHS: Record<BillingPeriod, number> = {
  monthly: 1,
  quarterly: 3,
  semiannual: 6,
  yearly: 12,
};
