"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { floatTransactions } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";

export async function getFloatBalanceCents(orgId: string) {
  const db = getDb();
  const rows = await db
    .select({ type: floatTransactions.type, amountCents: floatTransactions.amountCents })
    .from(floatTransactions)
    .where(eq(floatTransactions.orgId, orgId));

  return rows.reduce(
    (sum, r) => sum + (r.type === "deposit" ? r.amountCents : -r.amountCents),
    0,
  );
}

export async function createFloatTransaction(
  _prevState: unknown,
  formData: FormData,
) {
  const session = await getSession();
  if (!session) return { error: "Not authenticated." };

  const type = String(formData.get("type") ?? "");
  const amount = Math.round(Number(formData.get("amount") ?? 0));
  const note = String(formData.get("note") ?? "").trim();

  if (type !== "deposit" && type !== "withdrawal") {
    return { error: "Type de transaction invalide." };
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: "Le montant doit être supérieur à 0." };
  }

  if (type === "withdrawal") {
    const balance = await getFloatBalanceCents(session.orgId);
    if (amount > balance) {
      return { error: "Le montant dépasse le solde flottant disponible." };
    }
  }

  const db = getDb();
  await db.insert(floatTransactions).values({
    orgId: session.orgId,
    type,
    amountCents: amount,
    note: note || null,
    createdBy: session.userId,
  });

  revalidatePath("/admin/float");
  return { success: true };
}
