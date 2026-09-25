// TEMPORAIRE — config de la porte de monétisation manuelle des accès distants
// (WinBox/WebFig/SSH/MikHmon). Module "plain" (pas de "use server") :
// importable côté client (modal) pour l'affichage. Les prix réutilisent la
// grille existante (billing-plans.ts) : 1 mois 500, 3 mois 1300, 6 mois 2700,
// 12 mois 5800 FCFA — identique pour les quatre services.
// TODO: Remplacer par système de paiement intégré.

import {
  PERIOD_PRICE_CENTS,
  BILLING_PERIOD_MONTHS,
  type BillingPeriod,
} from "@/lib/mikrotik/billing-plans";

export type RemoteAccessService = "winbox" | "webfig" | "ssh" | "mikhmon";

export const REMOTE_ACCESS_SERVICES: { id: RemoteAccessService; label: string }[] = [
  { id: "mikhmon", label: "MikHmon (vouchers)" },
  { id: "webfig", label: "WebFig (navigateur)" },
  { id: "winbox", label: "WinBox" },
  { id: "ssh", label: "SSH / SFTP" },
];

export function isRemoteAccessService(value: string): value is RemoteAccessService {
  return REMOTE_ACCESS_SERVICES.some((s) => s.id === value);
}

export const BILLING_PERIODS: { id: BillingPeriod; label: string }[] = [
  { id: "monthly", label: "1 mois" },
  { id: "quarterly", label: "3 mois" },
  { id: "semiannual", label: "6 mois" },
  { id: "yearly", label: "12 mois" },
];

/**
 * MikHmon Online is billed independently from the legacy direct-access grid.
 * The operator requested a linear 500 FCFA/month price, while WinBox, WebFig
 * and SSH keep their existing discounted durations below.
 */
export const MIKHMON_ONLINE_PRICE_FCFA: Record<BillingPeriod, number> = {
  monthly: 500,
  quarterly: 1500,
  semiannual: 3000,
  yearly: 6000,
};

export function isBillingPeriod(value: string): value is BillingPeriod {
  return BILLING_PERIODS.some((p) => p.id === value);
}

/**
 * Tarif FCFA appliqué par service. The one-argument form is retained for
 * public generic pricing surfaces that intentionally describe the old grid.
 */
export function remoteAccessPriceFcfa(period: BillingPeriod): number;
export function remoteAccessPriceFcfa(service: string, period: BillingPeriod): number;
export function remoteAccessPriceFcfa(serviceOrPeriod: string, period?: BillingPeriod): number {
  const service = period ? serviceOrPeriod : null;
  const selectedPeriod = period ?? (serviceOrPeriod as BillingPeriod);
  return service === "mikhmon" ? MIKHMON_ONLINE_PRICE_FCFA[selectedPeriod] : PERIOD_PRICE_CENTS[selectedPeriod];
}

export function serviceLabel(service: string): string {
  return REMOTE_ACCESS_SERVICES.find((s) => s.id === service)?.label ?? service;
}

export function periodLabel(period: string): string {
  return BILLING_PERIODS.find((p) => p.id === period)?.label ?? period;
}

export function periodMonths(period: BillingPeriod): number {
  return BILLING_PERIOD_MONTHS[period];
}
