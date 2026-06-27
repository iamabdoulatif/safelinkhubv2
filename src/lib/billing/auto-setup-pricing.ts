// Plain shared module (no "use server") — importable from both server
// actions (container-setup.ts, port-forward.ts) and client components
// (AutoSetupSteps, DirectAccessSection) for display purposes. Same reason
// billing-plans.ts isn't a "use server" file: that directive only allows
// async function exports.

/**
 * One-time fee charged to the org's wallet when running the auto-setup
 * wizard on a router beyond the first free one. Priced by what the wizard
 * actually configures: container-capable boards (ARM/ARM64/Tile) get the
 * full Hotspot + MikHmon stack; mipsbe/mmips/smips boards (RB951 and
 * other legacy hardware) only get the hotspot/Wi-Fi steps, hence the
 * lower price.
 */
export const AUTO_SETUP_FEE_CENTS = {
  containerCapable: 20000,
  hotspotOnly: 10000,
} as const;

export function autoSetupFeeCentsFor(supportsContainers: boolean): number {
  return supportsContainers ? AUTO_SETUP_FEE_CENTS.containerCapable : AUTO_SETUP_FEE_CENTS.hotspotOnly;
}

/** One month of free direct-access VPN (WinBox/WebFig/SSH/MikHmon) plans per org, from signup. */
export const VPN_TRIAL_DAYS = 30;

export function vpnTrialEndsAt(orgCreatedAt: Date): Date {
  const d = new Date(orgCreatedAt);
  d.setDate(d.getDate() + VPN_TRIAL_DAYS);
  return d;
}

export function isWithinVpnTrial(orgCreatedAt: Date, now = new Date()): boolean {
  return now.getTime() < vpnTrialEndsAt(orgCreatedAt).getTime();
}

export function vpnTrialDaysRemaining(orgCreatedAt: Date, now = new Date()): number {
  const ms = vpnTrialEndsAt(orgCreatedAt).getTime() - now.getTime();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}
