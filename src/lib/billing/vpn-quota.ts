export const VPN_QUOTA_MODES = ["default", "free_until", "unlimited", "paid"] as const;
export type VpnQuotaMode = (typeof VPN_QUOTA_MODES)[number];

export const VPN_QUOTA_GRANT_OPTIONS = [
  { value: "free_1_month", label: "Gratuit 1 mois", months: 1 },
  { value: "free_3_months", label: "Gratuit 3 mois", months: 3 },
  { value: "free_6_months", label: "Gratuit 6 mois", months: 6 },
  { value: "free_12_months", label: "Gratuit 12 mois", months: 12 },
  { value: "unlimited", label: "Gratuit illimité", months: null },
  { value: "paid", label: "VPN payant", months: null },
] as const;

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

export function isVpnQuotaGrant(value: string): value is VpnQuotaGrant {
  return VPN_QUOTA_GRANT_OPTIONS.some((option) => option.value === value);
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
    expiresAt: addUtcMonths(now, option.months ?? 0),
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

export function shouldChargeVpnActivation(input: VpnChargeDecisionInput): boolean {
  if (input.isSuperAdmin) return false;

  const quota = getVpnQuotaStatus(input, input.now);
  if (quota.free) return false;
  if (quota.paidOverride) return true;
  if (!input.orgCreatedAt) return true;

  const trialEndsAt = new Date(input.orgCreatedAt);
  trialEndsAt.setDate(trialEndsAt.getDate() + 365);
  return (input.now ?? new Date()).getTime() >= trialEndsAt.getTime();
}
