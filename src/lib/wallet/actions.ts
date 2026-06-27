"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { walletTransactions } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";

export async function getWalletBalanceCents(orgId: string) {
  const db = getDb();
  const rows = await db
    .select({ type: walletTransactions.type, amountCents: walletTransactions.amountCents })
    .from(walletTransactions)
    .where(eq(walletTransactions.orgId, orgId));

  return rows.reduce(
    (sum, r) => sum + (r.type === "topup" ? r.amountCents : -r.amountCents),
    0,
  );
}

/**
 * Manual top-up — the only way to add funds for now, since no real payment
 * gateway is wired into the wallet yet (see DirectAccessSection's billing
 * note: every VPN access plan stays free regardless of balance until that
 * changes). Mirrors createFloatTransaction's pattern, minus the
 * withdrawal side, which doesn't apply here — only the system itself
 * charges this wallet, via chargeWalletForPortForward in port-forward.ts.
 */
export async function addWalletFunds(_prevState: unknown, formData: FormData) {
  const session = await getSession();
  if (!session) return { error: "Not authenticated." };

  const amount = Math.round(Number(formData.get("amount") ?? 0));
  const note = String(formData.get("note") ?? "").trim();

  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: "Le montant doit être supérieur à 0." };
  }

  const db = getDb();
  await db.insert(walletTransactions).values({
    orgId: session.orgId,
    type: "topup",
    amountCents: amount,
    note: note || null,
    createdBy: session.userId,
  });

  revalidatePath("/admin/billing");
  return { success: true };
}
