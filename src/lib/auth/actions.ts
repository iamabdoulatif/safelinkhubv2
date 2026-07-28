"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { and, eq, gt } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { organizations, users } from "@/lib/db/schema";
import {
  ACTIVATION_TOKEN_TTL_MS,
  PASSWORD_RESET_TOKEN_TTL_MS,
  generateToken,
  hashToken,
  tokenExpiry,
} from "./tokens";
import { sendActivationEmail, sendPasswordResetEmail } from "./email";
import { computeVpnQuotaGrant } from "@/lib/billing/vpn-quota";
import {
  clearMfaPendingToken,
  createMfaPendingToken,
  createSession,
  destroySession,
  getMfaPendingToken,
  getSession,
} from "./session";
import { getClientIp } from "./client-ip";
import { checkLoginRateLimit, recordLoginAttempt } from "./rate-limit";
import {
  consumeBackupCode,
  encryptMfaSecret,
  generateBackupCodes,
  generateMfaSecret,
  hashBackupCodes,
  mfaEnrollmentUri,
  verifyTotpCode,
} from "./mfa";

function safeCallbackPath(callback: string) {
  if (callback.startsWith("/admin") && !callback.startsWith("//")) {
    return callback;
  }
  return "/admin";
}

export type LoginState =
  | { error: string; mfaRequired?: undefined; needsVerification?: boolean }
  | { mfaRequired: true; error?: undefined; needsVerification?: undefined }
  | undefined;

export async function login(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");
  const callback = String(formData.get("callback") ?? "/admin");

  if (!email || !password) {
    return { error: "L'email et le mot de passe sont requis." };
  }

  const ip = await getClientIp();
  const rateLimit = await checkLoginRateLimit(email, ip);
  if (!rateLimit.allowed) {
    const minutes = Math.ceil(rateLimit.retryAfterSeconds / 60);
    return { error: `Trop de tentatives. Réessayez dans ${minutes} minute${minutes > 1 ? "s" : ""}.` };
  }

  const db = getDb();
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user) {
    await recordLoginAttempt(email, ip, false);
    return { error: "Email ou mot de passe invalide." };
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    await recordLoginAttempt(email, ip, false);
    return { error: "Email ou mot de passe invalide." };
  }

  // Password is correct — but an unverified account can't get a session yet.
  // Record the attempt as a success (the credentials were right) and steer
  // the user to the activation-resend flow rather than the dashboard.
  if (!user.emailVerified) {
    await recordLoginAttempt(email, ip, true);
    return {
      error: "Votre compte n'est pas encore activé. Vérifiez votre boîte mail ou renvoyez l'email d'activation.",
      needsVerification: true,
    };
  }

  if (user.mfaEnabled) {
    // Password is correct but access isn't granted yet — don't record a
    // success (or failure) until the second factor is checked too, so the
    // same rate-limit window covers both steps.
    await createMfaPendingToken({
      userId: user.id,
      orgId: user.orgId,
      email: user.email,
      name: user.name,
      role: user.role,
      callback: safeCallbackPath(callback),
    });
    return { mfaRequired: true };
  }

  await recordLoginAttempt(email, ip, true);
  await createSession({
    userId: user.id,
    orgId: user.orgId,
    email: user.email,
    name: user.name,
    role: user.role,
  });

  redirect(safeCallbackPath(callback));
}

export type VerifyMfaState = { error: string } | undefined;

export async function verifyMfaLogin(
  _prevState: VerifyMfaState,
  formData: FormData,
): Promise<VerifyMfaState> {
  const pending = await getMfaPendingToken();
  if (!pending) {
    return { error: "Session de connexion expirée, recommencez." };
  }

  const code = String(formData.get("code") ?? "").trim();
  if (!code) return { error: "Code requis." };

  const ip = await getClientIp();
  const rateLimit = await checkLoginRateLimit(pending.email, ip);
  if (!rateLimit.allowed) {
    const minutes = Math.ceil(rateLimit.retryAfterSeconds / 60);
    return { error: `Trop de tentatives. Réessayez dans ${minutes} minute${minutes > 1 ? "s" : ""}.` };
  }

  const db = getDb();
  const [user] = await db
    .select({
      mfaSecretEncrypted: users.mfaSecretEncrypted,
      mfaBackupCodesHash: users.mfaBackupCodesHash,
    })
    .from(users)
    .where(eq(users.id, pending.userId))
    .limit(1);

  if (!user?.mfaSecretEncrypted) {
    return { error: "Configuration MFA invalide, recommencez la connexion." };
  }

  const totpValid = verifyTotpCode(user.mfaSecretEncrypted, code);

  if (!totpValid) {
    const backupResult = await consumeBackupCode(user.mfaBackupCodesHash, code);
    if (!backupResult) {
      await recordLoginAttempt(pending.email, ip, false);
      return { error: "Code invalide." };
    }
    await db
      .update(users)
      .set({ mfaBackupCodesHash: backupResult.remaining })
      .where(eq(users.id, pending.userId));
  }

  await recordLoginAttempt(pending.email, ip, true);
  await clearMfaPendingToken();
  await createSession({
    userId: pending.userId,
    orgId: pending.orgId,
    email: pending.email,
    name: pending.name,
    role: pending.role,
  });

  redirect(pending.callback);
}

export async function register(_prevState: unknown, formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");
  const country = String(formData.get("country") ?? "").trim();
  const phoneDialCode = String(formData.get("phoneDialCode") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  // Blank means "same as phone" — resolved at read time (lib/intl resolves
  // null to the phone number wherever it's displayed), not defaulted here,
  // so a later phone change doesn't silently overwrite a custom value.
  const whatsapp = String(formData.get("whatsapp") ?? "").trim() || null;
  const telegram = String(formData.get("telegram") ?? "").trim() || null;

  if (!name || !email || !password || !confirmPassword || !country || !phoneDialCode || !phone) {
    return { error: "Tous les champs sont requis." };
  }
  if (password.length < 8) {
    return { error: "Le mot de passe doit contenir au moins 8 caractères." };
  }
  if (password !== confirmPassword) {
    return { error: "Les mots de passe ne correspondent pas." };
  }

  const db = getDb();

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing) {
    return { error: "Un compte avec cet email existe déjà." };
  }

  const slugBase = name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "org";
  const slug = `${slugBase}-${Math.random().toString(36).slice(2, 7)}`;

  // Essai gratuit d'accès distant VPN dès l'inscription : 10 jours de quota
  // `free_until` couvrant TOUS les services (WebFig, WinBox, MikHmon,
  // SSH/FileZilla) sur TOUS les routeurs. C'est le mécanisme reconnu de bout en
  // bout — evaluateRemoteAccessGate autorise (reason "quota"), l'expiration de
  // l'accès est plafonnée à la fin de l'essai, et aucun débit n'est fait
  // (shouldChargeVpnActivation renvoie false tant que le quota est gratuit).
  // Après 10 jours, le quota expire → l'accès distant redevient payant.
  const vpnTrial = computeVpnQuotaGrant("free_10_days");
  const [org] = await db
    .insert(organizations)
    .values({
      name: `Organisation de ${name}`,
      slug,
      vpnQuotaMode: vpnTrial.mode,
      vpnQuotaExpiresAt: vpnTrial.expiresAt,
    })
    .returning();

  const passwordHash = await bcrypt.hash(password, 10);

  // Account starts unverified; the activation link (below) is what flips it.
  const { token, hash } = generateToken();

  const [user] = await db
    .insert(users)
    .values({
      orgId: org.id,
      name,
      email,
      passwordHash,
      role: "admin",
      emailVerified: false,
      activationTokenHash: hash,
      activationTokenExpiresAt: tokenExpiry(ACTIVATION_TOKEN_TTL_MS),
      country,
      phoneDialCode,
      phone,
      whatsapp,
      telegram,
    })
    .returning();

  // Best-effort — if the mail fails to send, the account still exists and the
  // user can trigger a resend from the activation-sent page or the login form.
  await sendActivationEmail(user.email, user.name, token);

  // No session yet: the user must click the activation link first.
  redirect(`/auth/activation-envoyee?email=${encodeURIComponent(user.email)}`);
}

export type ActivateAccountState = { error: string } | undefined;

/**
 * Redeems an activation token (from the emailed link). On success the account
 * is marked verified, the token is cleared, and a real session is issued.
 */
export async function activateAccount(
  _prevState: ActivateAccountState,
  formData: FormData,
): Promise<ActivateAccountState> {
  const token = String(formData.get("token") ?? "").trim();
  if (!token) return { error: "Lien d'activation invalide." };

  const db = getDb();
  const [user] = await db
    .select()
    .from(users)
    .where(
      and(
        eq(users.activationTokenHash, hashToken(token)),
        gt(users.activationTokenExpiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!user) {
    return {
      error:
        "Ce lien d'activation est invalide ou expiré. Connectez-vous pour en recevoir un nouveau.",
    };
  }

  await db
    .update(users)
    .set({
      emailVerified: true,
      activationTokenHash: null,
      activationTokenExpiresAt: null,
    })
    .where(eq(users.id, user.id));

  await createSession({
    userId: user.id,
    orgId: user.orgId,
    email: user.email,
    name: user.name,
    role: user.role,
  });

  redirect("/admin");
}

export type ResendActivationState =
  | { success: true }
  | { success: false; error: string }
  | undefined;

/**
 * Re-sends the activation email. Always reports success (never reveals whether
 * an account exists or is already active), but only actually sends when there
 * is a matching unverified account.
 */
export async function resendActivation(
  _prevState: ResendActivationState,
  formData: FormData,
): Promise<ResendActivationState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!email) return { success: false, error: "Email requis." };

  const db = getDb();
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (user && !user.emailVerified) {
    const { token, hash } = generateToken();
    await db
      .update(users)
      .set({
        activationTokenHash: hash,
        activationTokenExpiresAt: tokenExpiry(ACTIVATION_TOKEN_TTL_MS),
      })
      .where(eq(users.id, user.id));
    await sendActivationEmail(user.email, user.name, token);
  }

  return { success: true };
}

export type RequestPasswordResetState =
  | { success: true }
  | { success: false; error: string }
  | undefined;

/**
 * "Mot de passe oublié" — issues a reset token and emails the link. Always
 * returns a generic success so the response can't be used to enumerate which
 * emails have accounts.
 */
export async function requestPasswordReset(
  _prevState: RequestPasswordResetState,
  formData: FormData,
): Promise<RequestPasswordResetState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!email) return { success: false, error: "Email requis." };

  const db = getDb();
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (user) {
    const { token, hash } = generateToken();
    await db
      .update(users)
      .set({
        passwordResetTokenHash: hash,
        passwordResetTokenExpiresAt: tokenExpiry(PASSWORD_RESET_TOKEN_TTL_MS),
      })
      .where(eq(users.id, user.id));
    await sendPasswordResetEmail(user.email, user.name, token);
  }

  return { success: true };
}

export type ResetPasswordState =
  | { success: true }
  | { success: false; error: string }
  | undefined;

/**
 * Redeems a password-reset token and sets the new password. A successful
 * reset also verifies the email (clicking the emailed link proves ownership),
 * so a never-activated user who resets their password can then log in.
 */
export async function resetPassword(
  _prevState: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> {
  const token = String(formData.get("token") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!token) return { success: false, error: "Lien de réinitialisation invalide." };
  if (password.length < 8) {
    return { success: false, error: "Le mot de passe doit contenir au moins 8 caractères." };
  }
  if (password !== confirmPassword) {
    return { success: false, error: "Les mots de passe ne correspondent pas." };
  }

  const db = getDb();
  const [user] = await db
    .select()
    .from(users)
    .where(
      and(
        eq(users.passwordResetTokenHash, hashToken(token)),
        gt(users.passwordResetTokenExpiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!user) {
    return {
      success: false,
      error: "Ce lien de réinitialisation est invalide ou expiré. Refaites une demande.",
    };
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await db
    .update(users)
    .set({
      passwordHash,
      emailVerified: true,
      passwordResetTokenHash: null,
      passwordResetTokenExpiresAt: null,
    })
    .where(eq(users.id, user.id));

  return { success: true };
}

export async function logout() {
  await destroySession();
}

export type UpdateProfileState = { success: true } | { success: false; error: string } | null;

export async function updateProfileName(
  _prevState: UpdateProfileState,
  formData: FormData,
): Promise<UpdateProfileState> {
  const session = await getSession();
  if (!session) return { success: false, error: "Session expirée." };

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { success: false, error: "Le nom ne peut pas être vide." };

  const db = getDb();
  await db.update(users).set({ name }).where(eq(users.id, session.userId));

  // The session JWT carries `name` for display — re-issue it so the
  // sidebar/profile reflect the change without forcing a re-login.
  await createSession({ ...session, name });

  revalidatePath("/admin", "layout");
  return { success: true };
}

export type ChangePasswordState = { success: true } | { success: false; error: string } | null;

export async function changePassword(
  _prevState: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  const session = await getSession();
  if (!session) return { success: false, error: "Session expirée." };

  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  if (!currentPassword || !newPassword) {
    return { success: false, error: "Tous les champs sont requis." };
  }
  if (newPassword.length < 8) {
    return { success: false, error: "Le nouveau mot de passe doit contenir au moins 8 caractères." };
  }

  const db = getDb();
  const [user] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);
  if (!user) return { success: false, error: "Session expirée." };

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) return { success: false, error: "Mot de passe actuel incorrect." };

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await db.update(users).set({ passwordHash }).where(eq(users.id, session.userId));

  return { success: true };
}

export type StartMfaEnrollmentState =
  | { success: true; secretEncrypted: string; manualEntryKey: string; uri: string }
  | { success: false; error: string }
  | null;

export async function startMfaEnrollment(): Promise<StartMfaEnrollmentState> {
  const session = await getSession();
  if (!session) return { success: false, error: "Session expirée." };

  const secret = generateMfaSecret();
  return {
    success: true,
    secretEncrypted: encryptMfaSecret(secret),
    manualEntryKey: secret,
    uri: mfaEnrollmentUri(session.email, secret),
  };
}

export type ConfirmMfaEnrollmentState =
  | { success: true; backupCodes: string[] }
  | { success: false; error: string }
  | null;

export async function confirmMfaEnrollment(
  _prevState: ConfirmMfaEnrollmentState,
  formData: FormData,
): Promise<ConfirmMfaEnrollmentState> {
  const session = await getSession();
  if (!session) return { success: false, error: "Session expirée." };

  const secretEncrypted = String(formData.get("secretEncrypted") ?? "");
  const code = String(formData.get("code") ?? "").trim();
  if (!secretEncrypted || !code) {
    return { success: false, error: "Code requis." };
  }

  if (!verifyTotpCode(secretEncrypted, code)) {
    return { success: false, error: "Code invalide — vérifiez l'heure de votre appareil et réessayez." };
  }

  const backupCodes = generateBackupCodes();
  const backupCodesHash = await hashBackupCodes(backupCodes);

  const db = getDb();
  await db
    .update(users)
    .set({ mfaSecretEncrypted: secretEncrypted, mfaEnabled: true, mfaBackupCodesHash: backupCodesHash })
    .where(eq(users.id, session.userId));

  revalidatePath("/admin/profile");
  return { success: true, backupCodes };
}

export type DisableMfaState = { success: true } | { success: false; error: string } | null;

export async function disableMfa(
  _prevState: DisableMfaState,
  formData: FormData,
): Promise<DisableMfaState> {
  const session = await getSession();
  if (!session) return { success: false, error: "Session expirée." };

  const currentPassword = String(formData.get("currentPassword") ?? "");
  if (!currentPassword) return { success: false, error: "Mot de passe requis." };

  const db = getDb();
  const [user] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);
  if (!user) return { success: false, error: "Session expirée." };

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) return { success: false, error: "Mot de passe incorrect." };

  await db
    .update(users)
    .set({ mfaEnabled: false, mfaSecretEncrypted: null, mfaBackupCodesHash: null })
    .where(eq(users.id, session.userId));

  revalidatePath("/admin/profile");
  return { success: true };
}
