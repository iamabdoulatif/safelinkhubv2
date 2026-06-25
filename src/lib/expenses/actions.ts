"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { expenses } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";

export async function createExpense(_prevState: unknown, formData: FormData) {
  const session = await getSession();
  if (!session) return { error: "Not authenticated." };

  const category = String(formData.get("category") ?? "").trim();
  const amount = Math.round(Number(formData.get("amount") ?? 0));
  const note = String(formData.get("note") ?? "").trim();
  const expenseDateRaw = String(formData.get("expenseDate") ?? "");

  if (!category) {
    return { error: "La catégorie est requise." };
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: "Le montant doit être supérieur à 0." };
  }

  const expenseDate = expenseDateRaw ? new Date(expenseDateRaw) : new Date();
  if (Number.isNaN(expenseDate.getTime())) {
    return { error: "Date invalide." };
  }

  const db = getDb();
  await db.insert(expenses).values({
    orgId: session.orgId,
    category,
    amountCents: amount,
    note: note || null,
    expenseDate,
    createdBy: session.userId,
  });

  revalidatePath("/admin/expenses");
  return { success: true };
}

export async function deleteExpense(expenseId: string) {
  const session = await getSession();
  if (!session) return;

  const db = getDb();
  const [row] = await db
    .select({ orgId: expenses.orgId })
    .from(expenses)
    .where(eq(expenses.id, expenseId))
    .limit(1);

  if (!row || row.orgId !== session.orgId) return;

  await db.delete(expenses).where(eq(expenses.id, expenseId));
  revalidatePath("/admin/expenses");
}
