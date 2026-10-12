// Détection du mini-navigateur captif et lien d'app Wave, pour le tunnel de
// paiement hébergé (/portal/pay, /portal/paid).

/** Vrai quand on est dans le mini-navigateur d'un portail captif (CNA iOS,
 * WebView de connexion Android) : les checkouts y échouent souvent. */
export function isCaptiveBrowser(userAgent: string): boolean {
  const isIOS = /iPhone|iPad|iPod/i.test(userAgent);
  const iosCaptive = isIOS && (/CaptiveNetworkSupport/i.test(userAgent) || !/Safari/i.test(userAgent));
  const androidCaptive = /Android/i.test(userAgent) && /;\s*wv\)/i.test(userAgent);
  return iosCaptive || androidCaptive;
}

/** Lien qui ouvre l'app Wave directement sur un checkout — ce que fait la
 * page pay.wave.com elle-même (`location.href = 'wave://capture/<url>'`,
 * relevé le 12/10/2026). null si ce n'est pas un checkout Wave. */
export function waveAppHref(checkoutUrl: string): string | null {
  try {
    const u = new URL(checkoutUrl);
    if (u.hostname !== "pay.wave.com") return null;
    return `wave://capture/${checkoutUrl}`;
  } catch {
    return null;
  }
}

/** Le même checkout sur qr.pay.wave.com — lien universel Wave (/c/* dans son
 * apple-app-site-association) : touché à la main, iOS peut le confier
 * directement à l'app, sans passer par le schéma wave: que la fenêtre Wi-Fi
 * captive refuse. null si ce n'est pas un checkout Wave. */
export function waveQrHref(checkoutUrl: string): string | null {
  try {
    const u = new URL(checkoutUrl);
    if (u.hostname !== "pay.wave.com" && u.hostname !== "qr.pay.wave.com") return null;
    u.hostname = "qr.pay.wave.com";
    return u.toString();
  } catch {
    return null;
  }
}
