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

/** Enrobe une URL https en lien `intent://` Android. Tapé dans la WebView du
 * portail captif Android (CaptivePortalLogin), Android résout l'intent HORS de
 * la WebView : le navigateur système (ou l'app qui gère le domaine) s'ouvre,
 * avec le vrai réseau de la voie de paiement. Sans ça, la WebView charge le
 * lien sur place et le relais `wave://` vers l'app échoue (rebond vers
 * connectivitycheck.gstatic.com observé le 24/11/2026). `browser_fallback_url`
 * ouvre quand même le navigateur si aucune app ne gère le lien. null si l'URL
 * n'est pas https. Le schéma `intent:` n'existe que sur Android — ne JAMAIS
 * l'utiliser côté iOS (le CNA le refuse), d'où la détection d'appelant. */
export function androidIntentHref(httpsUrl: string): string | null {
  try {
    const u = new URL(httpsUrl);
    if (u.protocol !== "https:") return null;
    return `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=https;S.browser_fallback_url=${encodeURIComponent(httpsUrl)};end`;
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
