import { createHash, randomBytes } from "crypto";

// Activation links are emailed and may sit in an inbox for a while, so a
// generous 24 h window. Password-reset tokens are more sensitive — 1 h.
export const ACTIVATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
export const PASSWORD_RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

/**
 * Generate a URL-safe random token plus its SHA-256 hash. Only the hash is
 * ever stored in the DB (same approach as the router install/bootstrap
 * tokens) — the raw token lives only in the emailed link, so a DB leak can't
 * be replayed to reset a password or activate an account.
 */
export function generateToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function tokenExpiry(ttlMs: number): Date {
  return new Date(Date.now() + ttlMs);
}
