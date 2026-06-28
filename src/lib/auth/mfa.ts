import { authenticator } from "otplib";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { encryptSecret, decryptSecret } from "@/lib/mikrotik/crypto";

const BACKUP_CODE_COUNT = 8;

export function generateMfaSecret(): string {
  return authenticator.generateSecret();
}

export function encryptMfaSecret(secret: string): string {
  return encryptSecret(secret);
}

export function decryptMfaSecret(encrypted: string): string {
  return decryptSecret(encrypted);
}

export function mfaEnrollmentUri(email: string, secret: string): string {
  return authenticator.keyuri(email, "SafeLinkHub", secret);
}

export function verifyTotpCode(encryptedSecret: string, code: string): boolean {
  const secret = decryptMfaSecret(encryptedSecret);
  // authenticator.check throws on malformed input (e.g. non-numeric) rather
  // than returning false — callers always pass user-supplied strings here.
  try {
    return authenticator.check(code.trim(), secret);
  } catch {
    return false;
  }
}

/** Plain codes shown to the user once; only the bcrypt hashes are persisted. */
export function generateBackupCodes(): string[] {
  return Array.from({ length: BACKUP_CODE_COUNT }, () =>
    randomBytes(5).toString("hex").toUpperCase(),
  );
}

export async function hashBackupCodes(codes: string[]): Promise<string> {
  const hashes = await Promise.all(codes.map((c) => bcrypt.hash(c, 10)));
  return JSON.stringify(hashes);
}

/**
 * Checks `code` against the stored hashes and returns the remaining set
 * (serialized) with the matched hash removed — backup codes are single use.
 * Returns null if no hash matched.
 */
export async function consumeBackupCode(
  storedHashesJson: string | null,
  code: string,
): Promise<{ remaining: string } | null> {
  if (!storedHashesJson) return null;
  let hashes: string[];
  try {
    hashes = JSON.parse(storedHashesJson);
  } catch {
    return null;
  }

  const normalized = code.trim().toUpperCase();
  for (let i = 0; i < hashes.length; i++) {
    if (await bcrypt.compare(normalized, hashes[i])) {
      const remaining = [...hashes.slice(0, i), ...hashes.slice(i + 1)];
      return { remaining: JSON.stringify(remaining) };
    }
  }
  return null;
}
