"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { organizations } from "@/lib/db/schema";
import { getSession, destroySession } from "@/lib/auth/session";

export async function getCurrentOrganization() {
  const session = await getSession();
  if (!session) return null;

  const db = getDb();
  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, session.orgId))
    .limit(1);
  return org ?? null;
}

export async function updateOrganizationName(_prevState: unknown, formData: FormData) {
  const session = await getSession();
  if (!session) return { error: "Not authenticated." };

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Le nom de l'organisation est requis." };

  const db = getDb();
  await db.update(organizations).set({ name }).where(eq(organizations.id, session.orgId));

  revalidatePath("/admin/settings/advanced");
  revalidatePath("/admin/billing");
  return { success: true };
}

/**
 * Irreversible — cascades to every router, voucher, package, user, etc. on
 * this org per the FK constraints in schema.ts. Requires typing the exact
 * org slug as a confirmation, same pattern as GitHub's "delete repository".
 */
export async function deleteOrganization(_prevState: unknown, formData: FormData) {
  const session = await getSession();
  if (!session) return { error: "Not authenticated." };

  const db = getDb();
  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, session.orgId))
    .limit(1);
  if (!org) return { error: "Organization not found." };

  const confirmText = String(formData.get("confirmSlug") ?? "").trim();
  if (confirmText !== org.slug) {
    return { error: "Le texte saisi ne correspond pas à l'identifiant de l'organisation." };
  }

  await db.delete(organizations).where(eq(organizations.id, session.orgId));
  await destroySession();
  redirect("/auth/login");
}
