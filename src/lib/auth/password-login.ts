import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { checkLoginRateLimit, recordLoginAttempt } from "./rate-limit";
import { consumeBackupCode, verifyTotpCode } from "./mfa";
import type { SessionPayload } from "./session";

export type CredentialsResult =
  | { kind: "missing" }
  | { kind: "rate-limited"; retryAfterSeconds: number }
  | { kind: "invalid" }
  | { kind: "inactive" }
  | { kind: "mfa"; user: SessionPayload }
  | { kind: "ok"; user: SessionPayload };

/**
 * Contrôle e-mail + mot de passe, partagé par la connexion web (actions.ts) et
 * l'API mobile : même limitation de tentatives, même refus des comptes non
 * activés, même bascule vers le second facteur.
 */
export async function verifyCredentials(
  rawEmail: string,
  password: string,
  ip: string,
): Promise<CredentialsResult> {
  const email = rawEmail.trim().toLowerCase();
  if (!email || !password) return { kind: "missing" };

  const rateLimit = await checkLoginRateLimit(email, ip);
  if (!rateLimit.allowed) return { kind: "rate-limited", retryAfterSeconds: rateLimit.retryAfterSeconds };

  const [user] = await getDb().select().from(users).where(eq(users.email, email)).limit(1);
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    await recordLoginAttempt(email, ip, false);
    return { kind: "invalid" };
  }

  // Mot de passe juste mais compte non activé : pas de session.
  if (!user.emailVerified) {
    await recordLoginAttempt(email, ip, true);
    return { kind: "inactive" };
  }

  const payload: SessionPayload = {
    userId: user.id,
    orgId: user.orgId,
    email: user.email,
    name: user.name,
    role: user.role,
  };
  // MFA : ni succès ni échec enregistré avant le second facteur, pour que la
  // même fenêtre de limitation couvre les deux étapes.
  if (user.mfaEnabled) return { kind: "mfa", user: payload };

  await recordLoginAttempt(email, ip, true);
  return { kind: "ok", user: payload };
}

/**
 * Second facteur : code TOTP, sinon code de secours (consommé). Partagé par la
 * connexion web et l'API mobile. `false` = code faux (tentative enregistrée).
 */
export async function verifySecondFactor(
  pending: SessionPayload,
  code: string,
  ip: string,
): Promise<{ ok: true } | { ok: false; reason: "rate-limited"; retryAfterSeconds: number } | { ok: false; reason: "config" | "invalid" }> {
  const rateLimit = await checkLoginRateLimit(pending.email, ip);
  if (!rateLimit.allowed) return { ok: false, reason: "rate-limited", retryAfterSeconds: rateLimit.retryAfterSeconds };

  const db = getDb();
  const [user] = await db
    .select({ mfaSecretEncrypted: users.mfaSecretEncrypted, mfaBackupCodesHash: users.mfaBackupCodesHash })
    .from(users)
    .where(eq(users.id, pending.userId))
    .limit(1);
  if (!user?.mfaSecretEncrypted) return { ok: false, reason: "config" };

  if (!verifyTotpCode(user.mfaSecretEncrypted, code)) {
    const backup = await consumeBackupCode(user.mfaBackupCodesHash, code);
    if (!backup) {
      await recordLoginAttempt(pending.email, ip, false);
      return { ok: false, reason: "invalid" };
    }
    await db.update(users).set({ mfaBackupCodesHash: backup.remaining }).where(eq(users.id, pending.userId));
  }
  await recordLoginAttempt(pending.email, ip, true);
  return { ok: true };
}
