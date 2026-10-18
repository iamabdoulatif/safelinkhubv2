import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { walletTransactions } from "@/lib/db/schema";

type Charge = typeof walletTransactions.$inferInsert;
type Transaction = Parameters<
  Parameters<ReturnType<typeof getDb>["transaction"]>[0]
>[0];

/** Serialize balance decisions, debit and entitlement creation together. */
export async function chargeWalletAtomically<T>(
  charge: Charge,
  grant: (tx: Transaction) => Promise<T>,
  routerId?: string,
) {
  if (
    charge.type !== "charge" ||
    !Number.isInteger(charge.amountCents) ||
    charge.amountCents <= 0
  )
    throw new Error("Débit portefeuille invalide.");
  return getDb().transaction(async (tx) => {
    if (routerId) {
      const owned = await tx.execute(
        sql`select id from routers where id=${routerId} and org_id=${charge.orgId} for update`,
      );
      if (!owned.rows.length)
        throw new Error("Routeur introuvable dans votre organisation.");
    }
    await tx.execute(
      sql`select id from organizations where id=${charge.orgId} for no key update`,
    );
    // Same lock as Multi-WAN purchases, including other organizations' writes.
    // No network I/O is allowed inside grant: this transaction stays short.
    await tx.execute(
      sql`lock table wallet_transactions in share row exclusive mode`,
    );
    const rows = await tx
      .select({
        type: walletTransactions.type,
        amount: walletTransactions.amountCents,
        status: walletTransactions.status,
      })
      .from(walletTransactions)
      .where(eq(walletTransactions.orgId, charge.orgId));
    const balance = rows.reduce(
      (sum, r) =>
        sum +
        (r.status === "completed"
          ? r.type === "topup"
            ? r.amount
            : -r.amount
          : 0),
      0,
    );
    if (balance < charge.amountCents)
      throw new Error(
        "Solde portefeuille insuffisant. Actualisez votre solde.",
      );
    await tx.insert(walletTransactions).values(charge);
    return grant(tx);
  });
}
