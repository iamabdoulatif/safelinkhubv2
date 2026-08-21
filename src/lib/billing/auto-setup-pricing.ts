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
// Aligné sur le gate-config du paiement en ligne (auto-setup-gate-config.ts :
// 15 000 container / 10 000 hotspot-only) pour qu'un même prix s'affiche et se
// facture quel que soit le chemin (paiement en ligne = source de vérité, repli
// wallet identique). Plus de "deux prix qui coexistent".
export const AUTO_SETUP_FEE_CENTS = {
  containerCapable: 15000,
  hotspotOnly: 10000,
} as const;

export function autoSetupFeeCentsFor(supportsContainers: boolean): number {
  return supportsContainers ? AUTO_SETUP_FEE_CENTS.containerCapable : AUTO_SETUP_FEE_CENTS.hotspotOnly;
}

/* Essai gratuit des accès directs (WinBox/WebFig/SSH/MikHmon) par org, dès
 * l'inscription : puis TOUT accès distant devient payant (débit du
 * portefeuille à l'activation).
 *
 * DEUX DURÉES, ET C'EST VOLONTAIRE. L'offre est passée de 10 à 30 jours le
 * 21/08/2026. Se contenter de changer la constante aurait été rétroactif :
 * `shouldChargeVpnActivation` recalcule l'essai en direct depuis la date de
 * création de l'organisation, pour toute org dont le quota stocké n'est plus
 * gratuit. Mesuré au moment du changement : 17 organisations créées entre 10 et
 * 30 jours plus tôt auraient récupéré l'accès distant gratuit sans rien
 * demander — alors que la consigne était « pour les nouveaux utilisateurs ».
 *
 * Chaque organisation garde donc ce qui lui a été promis, selon sa date
 * d'inscription. */

/** Bascule 10 → 30 jours. Les orgs créées AVANT gardent 10 jours. */
export const VPN_TRIAL_30D_SINCE = new Date("2026-08-21T00:00:00.000Z");

/** Offre courante : ce que voit un visiteur et ce que reçoit un nouveau compte. */
export const VPN_TRIAL_DAYS = 30;

/** Ce qui avait été promis aux comptes antérieurs à la bascule. Figé. */
export const LEGACY_VPN_TRIAL_DAYS = 10;

/** Durée d'essai due à CETTE organisation, d'après sa date d'inscription. */
export function vpnTrialDaysFor(orgCreatedAt: Date): number {
  return orgCreatedAt.getTime() >= VPN_TRIAL_30D_SINCE.getTime()
    ? VPN_TRIAL_DAYS
    : LEGACY_VPN_TRIAL_DAYS;
}

export function vpnTrialEndsAt(orgCreatedAt: Date): Date {
  const d = new Date(orgCreatedAt);
  d.setDate(d.getDate() + vpnTrialDaysFor(orgCreatedAt));
  return d;
}

export function isWithinVpnTrial(orgCreatedAt: Date, now = new Date()): boolean {
  return now.getTime() < vpnTrialEndsAt(orgCreatedAt).getTime();
}

export function vpnTrialDaysRemaining(orgCreatedAt: Date, now = new Date()): number {
  const ms = vpnTrialEndsAt(orgCreatedAt).getTime() - now.getTime();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}
