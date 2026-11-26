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

/** Vrai pour la WebView Android du portail captif, où un lien https Wave est
 * rendu dans la WebView au lieu de laisser Android ouvrir le navigateur/app. */
export function isAndroidCaptiveBrowser(userAgent: string): boolean {
  return /Android/i.test(userAgent) && /;\s*wv\)/i.test(userAgent);
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

/** Enrobe une URL https en lien `intent://` Android vers Chrome. Tapé dans la
 * WebView du portail captif Android (CaptivePortalLogin), Android résout
 * l'intent HORS de la WebView et Chrome reprend la session de la voie de
 * paiement. Le package explicite est important : sans lui, Android affiche
 * « cette connexion nécessite l'ouverture d'une autre application », puis le
 * bouton « continuer dans le navigateur » revient parfois dans la WebView et
 * échoue sur la connexion sécurisée (vidéo Android du 24/11/2026).
 * `browser_fallback_url` garde un repli pour les téléphones sans Chrome.
 * null si l'URL n'est pas https. Le schéma `intent:` n'existe que sur Android
 * — ne JAMAIS l'utiliser côté iOS (le CNA le refuse). */
export function androidIntentHref(httpsUrl: string): string | null {
  try {
    const u = new URL(httpsUrl);
    if (u.protocol !== "https:") return null;
    return `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(httpsUrl)};end`;
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

/** URL à utiliser après création d'un paiement, selon le navigateur.
 *
 * Les CNA Android refusent souvent de suivre une redirection HTTP vers un
 * opérateur et restent dans leur WebView. Un intent HTTPS les sort vers
 * Chrome, qui peut ensuite remettre la main à l'application opérateur. Pour
 * Wave utilise toujours son lien universel qr.pay.wave.com afin que le
 * paiement soit remis à l'application Wave.
 */
export function paymentAppHref(checkoutUrl: string, userAgent: string, captive: boolean): string | null {
  const waveQr = waveQrHref(checkoutUrl);
  const isAndroid = /Android/i.test(userAgent);
  const isIOS = /iPhone|iPad|iPod/i.test(userAgent);

  if (waveQr) {
    return isAndroid && captive ? androidIntentHref(waveQr) ?? waveQr : waveQr;
  }

  if (isAndroid && captive) return androidIntentHref(checkoutUrl) ?? checkoutUrl;
  if (isIOS) return checkoutUrl;
  return checkoutUrl;
}
