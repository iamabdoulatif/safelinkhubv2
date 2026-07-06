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

export function isBillingPeriod(value: string): value is BillingPeriod {
  return BILLING_PERIODS.some((p) => p.id === value);
}

/** Tarif en FCFA pour une période (identique pour tous les services). */
export function remoteAccessPriceFcfa(period: BillingPeriod): number {
  return PERIOD_PRICE_CENTS[period];
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
