import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Secret par routeur pour le webhook roaming `POST /api/roaming/seen`.
 *
 * DÉRIVÉ, jamais stocké : HMAC-SHA256(AUTH_SECRET, routerId) → 24 caractères
 * base64url. Baké dans le script `on-login` du profil roaming au provisioning,
 * puis recalculé côté SaaS pour authentifier l'appel entrant. Chaque routeur a
 * donc une clé unique, révocable en changeant AUTH_SECRET, et aucune migration
 * DB n'est nécessaire.
 *
 * Ce secret ne fait que réduire le bruit / le DoS : le webhook re-vérifie
 * ENSUITE, via l'API du routeur émetteur, que la session (user, mac) existe
 * réellement avant d'agir — un appel forgé avec la bonne clé ne peut donc pas
 * lier un MAC arbitraire à un code d'autrui.
 */

function appKey(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return secret;
}

/** Clé webhook déterministe d'un routeur (à baker dans son on-login). */
export function deriveRouterKey(routerId: string): string {
  return createHmac("sha256", appKey()).update(routerId).digest("base64url").slice(0, 24);
}

/** Compare en temps constant la clé fournie à celle attendue pour ce routeur. */
export function verifyRouterKey(routerId: string, provided: string | null | undefined): boolean {
  if (!routerId || !provided) return false;
  const expected = Buffer.from(deriveRouterKey(routerId));
  const given = Buffer.from(provided);
  if (expected.length !== given.length) return false;
  return timingSafeEqual(expected, given);
}
