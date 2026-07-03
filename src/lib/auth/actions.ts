"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { organizations, users } from "@/lib/db/schema";
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
  | { error: string; mfaRequired?: undefined }
  | { mfaRequired: true; error?: undefined }
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

  const [org] = await db
    .insert(organizations)
    .values({ name: `Organisation de ${name}`, slug })
    .returning();

  const passwordHash = await bcrypt.hash(password, 10);

  const [user] = await db
    .insert(users)
    .values({
      orgId: org.id,
      name,
      email,
      passwordHash,
      role: "admin",
      country,
      phoneDialCode,
      phone,
      whatsapp,
      telegram,
    })
    .returning();

  await createSession({
    userId: user.id,
    orgId: user.orgId,
    email: user.email,
    name: user.name,
    role: user.role,
  });

  redirect("/admin");
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
