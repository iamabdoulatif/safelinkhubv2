import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Jeton d'aperçu de portail. L'aperçu tourne dans une iframe sandboxée
 * (origine opaque) : ses sous-requêtes (CSS, images, polices) partent SANS le
 * cookie de session (SameSite=Lax). L'autorisation voyage donc dans l'URL :
 * modèle + routeur + organisation, signés, valables une heure.
 */
export type PreviewClaims = { templateId: string; routerId: string; orgId: string; exp: number };

const TTL_MS = 60 * 60 * 1000;

function mac(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function signPreviewToken(
  claims: Omit<PreviewClaims, "exp">,
  secret = process.env.AUTH_SECRET ?? "",
  now = Date.now(),
): string {
  const payload = Buffer.from(JSON.stringify({ ...claims, exp: now + TTL_MS })).toString("base64url");
  return `${payload}.${mac(payload, secret)}`;
}

export function verifyPreviewToken(
  token: string,
  secret = process.env.AUTH_SECRET ?? "",
  now = Date.now(),
): PreviewClaims | null {
  if (!secret) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = Buffer.from(mac(payload, secret));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString()) as PreviewClaims;
    return claims.exp > now ? claims : null;
  } catch {
    return null;
  }
}
