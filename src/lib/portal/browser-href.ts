// Lien qui fait SORTIR le client du mini-navigateur de portail captif pour
// ouvrir la page dans son vrai navigateur. Dans la fenêtre « Wi-Fi captif »
// d'iOS (CNA), window.open et target=_blank sont ignorés : le client devait
// copier l'URL, quitter le CNA (« Utiliser sans Internet ») puis la coller
// dans Chrome. Les schémas x-safari-https:// (iOS) et intent:// (WebView
// Android) demandent au système d'ouvrir l'URL dans le navigateur par défaut.
// Sur un navigateur normal, on renvoie l'URL telle quelle.

export function browserHref(url: string, userAgent: string): string {
  if (/iPhone|iPad|iPod/i.test(userAgent)) {
    return url.replace(/^https:\/\//i, "x-safari-https://").replace(/^http:\/\//i, "x-safari-http://");
  }
  if (/Android/i.test(userAgent)) {
    const u = new URL(url);
    return `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=${u.protocol.replace(":", "")};end`;
  }
  return url;
}

/** Vrai quand on est dans le mini-navigateur d'un portail captif (CNA iOS,
 * WebView de connexion Android) : les checkouts y échouent souvent. */
export function isCaptiveBrowser(userAgent: string): boolean {
  const isIOS = /iPhone|iPad|iPod/i.test(userAgent);
  const iosCaptive = isIOS && (/CaptiveNetworkSupport/i.test(userAgent) || !/Safari/i.test(userAgent));
  const androidCaptive = /Android/i.test(userAgent) && /;\s*wv\)/i.test(userAgent);
  return iosCaptive || androidCaptive;
}
