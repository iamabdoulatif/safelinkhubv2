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
