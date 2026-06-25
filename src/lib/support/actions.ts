"use server";

import { revalidatePath } from "next/cache";
import { eq, desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { supportTickets } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";

export async function listSupportTickets() {
  const session = await getSession();
  if (!session) return [];

  const db = getDb();
  return db
    .select()
    .from(supportTickets)
    .where(eq(supportTickets.orgId, session.orgId))
    .orderBy(desc(supportTickets.createdAt));
}

export async function createSupportTicket(_prevState: unknown, formData: FormData) {
  const session = await getSession();
  if (!session) return { error: "Not authenticated." };

  const subject = String(formData.get("subject") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();

  if (!subject || !message) {
    return { error: "Le sujet et le message sont requis." };
  }

  const db = getDb();
  await db.insert(supportTickets).values({
    orgId: session.orgId,
    subject,
    message,
    createdBy: session.userId,
  });

  revalidatePath("/admin/support");
  return { success: true };
}
