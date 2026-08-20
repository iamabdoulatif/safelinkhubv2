// Mise en forme du message diffusé sur les réseaux. Module PUR : aucun accès
// réseau ni base, donc entièrement testable.

export type SharePost = {
  title: string;
  slug: string;
  excerpt: string | null;
  category: string | null;
};

/** Longueur maximale d'un message Telegram (Bot API, `sendMessage`). */
export const TELEGRAM_MAX = 4096;

/** Échappe les caractères réservés du parse_mode HTML de Telegram. */
export function escapeTelegramHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function articleUrl(appUrl: string, slug: string): string {
  return `${appUrl.replace(/\/+$/, "")}/blog/${slug}`;
}

/**
 * Coupe un texte sans le trancher au milieu d'un mot, et sans laisser la
 * ponctuation orpheline. Renvoie la chaîne telle quelle si elle tient.
 */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:.–—-]+$/, "")}…`;
}

/**
 * Message Telegram, en HTML.
 *
 * Le titre est en gras et le lien est posé NU en dernière ligne plutôt que
 * caché derrière un <a> : Telegram ne génère son aperçu (image de couverture,
 * titre, description) qu'à partir d'une URL visible dans le texte.
 */
export function buildTelegramMessage(post: SharePost, appUrl: string): string {
  const url = articleUrl(appUrl, post.slug);
  const parts = [`<b>${escapeTelegramHtml(post.title)}</b>`];
  if (post.excerpt) parts.push(escapeTelegramHtml(truncate(post.excerpt, 400)));
  if (post.category) parts.push(`#${post.category.replace(/[^\p{L}\p{N}]+/gu, "")}`);
  parts.push(url);
  const message = parts.join("\n\n");
  // Garde-fou : au-delà de 4096 caractères l'API rejette tout le message. On
  // sacrifie l'accroche, jamais le lien.
  if (message.length <= TELEGRAM_MAX) return message;
  return `<b>${escapeTelegramHtml(post.title)}</b>\n\n${url}`;
}

/**
 * Message Facebook, en texte brut.
 *
 * Le lien est passé séparément au paramètre `link` de l'API : c'est lui qui
 * produit la carte d'aperçu. Le répéter dans le corps afficherait l'URL deux
 * fois sous la carte.
 */
export function buildFacebookMessage(post: SharePost): string {
  const parts = [post.title];
  if (post.excerpt) parts.push(truncate(post.excerpt, 500));
  if (post.category) parts.push(`#${post.category.replace(/[^\p{L}\p{N}]+/gu, "")}`);
  return parts.join("\n\n");
}
