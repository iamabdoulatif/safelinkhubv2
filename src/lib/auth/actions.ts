"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { organizations, users } from "@/lib/db/schema";
import { createSession, destroySession, getSession } from "./session";

function safeCallbackPath(callback: string) {
  if (callback.startsWith("/admin") && !callback.startsWith("//")) {
    return callback;
  }
  return "/admin";
}

export async function login(_prevState: unknown, formData: FormData) {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");
  const callback = String(formData.get("callback") ?? "/admin");

  if (!email || !password) {
    return { error: "L'email et le mot de passe sont requis." };
  }

  const db = getDb();
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user) {
    return { error: "Email ou mot de passe invalide." };
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return { error: "Email ou mot de passe invalide." };
  }

  await createSession({
    userId: user.id,
    orgId: user.orgId,
    email: user.email,
    name: user.name,
    role: user.role,
  });

  redirect(safeCallbackPath(callback));
}

export async function register(_prevState: unknown, formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!name || !email || !password) {
    return { error: "Tous les champs sont requis." };
  }
  if (password.length < 6) {
    return { error: "Le mot de passe doit contenir au moins 6 caractères." };
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
  redirect("/auth/login");
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
  if (newPassword.length < 6) {
    return { success: false, error: "Le nouveau mot de passe doit contenir au moins 6 caractères." };
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
