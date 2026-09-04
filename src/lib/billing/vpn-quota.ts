import { vpnTrialDaysFor } from "./auto-setup-pricing";

export const VPN_QUOTA_MODES = ["default", "free_until", "unlimited", "paid"] as const;
export type VpnQuotaMode = (typeof VPN_QUOTA_MODES)[number];

export const VPN_QUOTA_GRANT_OPTIONS = [
  { value: "free_1_hour", label: "Gratuit 1 heure", months: null, durationMs: 60 * 60 * 1000 },
  { value: "free_2_hours", label: "Gratuit 2 heures", months: null, durationMs: 2 * 60 * 60 * 1000 },
  { value: "free_7_days", label: "Gratuit 7 jours", months: null, durationMs: 7 * 24 * 60 * 60 * 1000 },
  { value: "free_10_days", label: "Gratuit 10 jours", months: null, durationMs: 10 * 24 * 60 * 60 * 1000 },
  // Offre d'inscription depuis le 21/08/2026. free_10_days reste dans la liste :
  // c'est le quota déjà stocké sur les comptes antérieurs, et le superadmin doit
  // pouvoir continuer à l'accorder à la main.
  { value: "free_30_days", label: "Gratuit 30 jours", months: null, durationMs: 30 * 24 * 60 * 60 * 1000 },
  { value: "free_1_month", label: "Gratuit 1 mois", months: 1, durationMs: null },
  { value: "free_3_months", label: "Gratuit 3 mois", months: 3, durationMs: null },
  { value: "free_6_months", label: "Gratuit 6 mois", months: 6, durationMs: null },
  { value: "free_12_months", label: "Gratuit 12 mois", months: 12, durationMs: null },
  { value: "unlimited", label: "Gratuit illimité", months: null, durationMs: null },
  { value: "paid", label: "VPN payant", months: null, durationMs: null },
] as const;

/** Choix « ce routeur suit son organisation » — efface sa surcharge. */
export const ROUTER_QUOTA_INHERIT = "inherit" as const;

export type VpnQuotaGrant = (typeof VPN_QUOTA_GRANT_OPTIONS)[number]["value"];

export type VpnQuotaFields = {
  vpnQuotaMode: string | null;
  vpnQuotaExpiresAt: Date | null;
};

export type VpnQuotaPatch = {
  mode: VpnQuotaMode;
  expiresAt: Date | null;
};

export type VpnQuotaStatus = {
  mode: VpnQuotaMode;
  free: boolean;
  paidOverride: boolean;
  unlimited: boolean;
  expiresAt: Date | null;
  daysRemaining: number;
};

export type VpnChargeDecisionInput = VpnQuotaFields & {
  isSuperAdmin: boolean;
  orgCreatedAt: Date | null;
  now?: Date;
};

function addUtcMonths(date: Date, months: number): Date {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

function addQuotaDuration(date: Date, option: (typeof VPN_QUOTA_GRANT_OPTIONS)[number]): Date {
  if (option.durationMs !== null) return new Date(date.getTime() + option.durationMs);
  return addUtcMonths(date, option.months ?? 0);
}

export function isVpnQuotaGrant(value: string): value is VpnQuotaGrant {
  return VPN_QUOTA_GRANT_OPTIONS.some((option) => option.value === value);
}

/**
 * Quota qui s'applique à UN routeur : sa propre surcharge si le superadmin lui
 * en a posé une, sinon celle de son organisation. Un compte peut porter
 * plusieurs zones ; offrir un mois à l'une ne doit pas l'offrir à toutes.
 */
export function resolveVpnQuotaFields(
  router: VpnQuotaFields | null | undefined,
  org: VpnQuotaFields | null | undefined,
): VpnQuotaFields {
  if (router?.vpnQuotaMode) return router;
  return org ?? { vpnQuotaMode: null, vpnQuotaExpiresAt: null };
}

export function normalizeVpnQuotaMode(mode: string | null | undefined): VpnQuotaMode {
  return VPN_QUOTA_MODES.includes(mode as VpnQuotaMode) ? (mode as VpnQuotaMode) : "default";
}

export function computeVpnQuotaGrant(grant: VpnQuotaGrant, now = new Date()): VpnQuotaPatch {
  const option = VPN_QUOTA_GRANT_OPTIONS.find((item) => item.value === grant);
  if (!option) {
    return { mode: "default", expiresAt: null };
  }

  if (grant === "unlimited") return { mode: "unlimited", expiresAt: null };
  if (grant === "paid") return { mode: "paid", expiresAt: null };

  return {
    mode: "free_until",
    expiresAt: addQuotaDuration(now, option),
  };
}

export function getVpnQuotaStatus(fields: VpnQuotaFields, now = new Date()): VpnQuotaStatus {
  const mode = normalizeVpnQuotaMode(fields.vpnQuotaMode);

  if (mode === "unlimited") {
    return {
      mode,
      free: true,
      paidOverride: false,
      unlimited: true,
      expiresAt: null,
      daysRemaining: Infinity,
    };
  }

  if (mode === "paid") {
    return {
      mode,
      free: false,
      paidOverride: true,
      unlimited: false,
      expiresAt: null,
      daysRemaining: 0,
    };
  }

  if (
    mode === "free_until" &&
    fields.vpnQuotaExpiresAt &&
    fields.vpnQuotaExpiresAt.getTime() > now.getTime()
  ) {
    const ms = fields.vpnQuotaExpiresAt.getTime() - now.getTime();
    return {
      mode,
      free: true,
      paidOverride: false,
      unlimited: false,
      expiresAt: fields.vpnQuotaExpiresAt,
      daysRemaining: Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000))),
    };
  }

  return {
    mode: "default",
    free: false,
    paidOverride: false,
    unlimited: false,
    expiresAt: null,
    daysRemaining: 0,
  };
}

/** A free quota can never be extended by a longer plan selected in the UI. */
export function capVpnAccessExpiry(planExpiresAt: Date, quotaExpiresAt: Date | null): Date {
  if (!quotaExpiresAt || quotaExpiresAt.getTime() >= planExpiresAt.getTime()) return planExpiresAt;
  return quotaExpiresAt;
}

export function shouldChargeVpnActivation(input: VpnChargeDecisionInput): boolean {
  if (input.isSuperAdmin) return false;

  const quota = getVpnQuotaStatus(input, input.now);
  if (quota.free) return false;
  if (quota.paidOverride) return true;
  if (!input.orgCreatedAt) return true;

  // Essai gratuit depuis l'inscription — la durée dépend de la DATE de
  // création : 30 jours depuis la bascule du 21/08/2026, 10 avant. Utiliser la
  // durée courante pour tout le monde rendrait l'accès distant gratuit, à
  // rebours, aux organisations inscrites juste avant.
  const trialEndsAt = new Date(input.orgCreatedAt);
  trialEndsAt.setDate(trialEndsAt.getDate() + vpnTrialDaysFor(input.orgCreatedAt));
  return (input.now ?? new Date()).getTime() >= trialEndsAt.getTime();
}
