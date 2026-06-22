"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { organizations, users } from "@/lib/db/schema";
import { createSession, destroySession } from "./session";

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
  });

  redirect(callback || "/admin");
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
  });

  redirect("/admin");
}

export async function logout() {
  await destroySession();
  redirect("/auth/login");
}
