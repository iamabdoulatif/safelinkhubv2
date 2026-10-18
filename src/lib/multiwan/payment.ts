import { Pool, type PoolClient } from "pg";
import { MULTIWAN_PRICE_FCFA, UUID } from "./config";
import { fcfaToScCents } from "@/lib/safecoin/pricing";
import { DEFAULT_SC_RATE_FCFA } from "@/lib/safecoin/constants";

let pool: Pool | null = null;
function billingPool() {
  return (pool ??= new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 3,
  }));
}
export type MultiwanPurchase = {
  routerId: string;
  orgId: string;
  userId: string;
  source: "wallet" | "safecoin";
  quotedRate: number;
};

/** The caller must pass identity from a verified session. Exposed separately
 * for PostgreSQL integration tests with isolated temporary schemas. */
export async function purchaseMultiwanOnConnection(
  client: PoolClient,
  input: MultiwanPurchase,
) {
  if (
    ![input.routerId, input.orgId, input.userId].every((id) => UUID.test(id)) ||
    !["wallet", "safecoin"].includes(input.source)
  )
    throw new Error("Achat invalide.");
  await client.query("begin");
  try {
    const router = await client.query(
      "select id from routers where id=$1 and org_id=$2 for update",
      [input.routerId, input.orgId],
    );
    if (!router.rowCount)
      throw new Error("Routeur introuvable dans votre organisation.");
    const existing = await client.query(
      "select id from router_multiwan_licenses where org_id=$1 and router_id=$2",
      [input.orgId, input.routerId],
    );
    if (existing.rowCount) {
      await client.query("commit");
      return { alreadyPaid: true };
    }
    await client.query(
      "select id from organizations where id=$1 for no key update",
      [input.orgId],
    );
    const reference = `multiwan:${input.orgId}:${input.routerId}`;
    let scCost: number | null = null,
      rate: number | null = null;
    if (input.source === "wallet") {
      // All legacy inserts acquire ROW EXCLUSIVE. This table lock prevents a
      // wallet write from slipping between our balance read and our debit.
      await client.query(
        "lock table wallet_transactions in share row exclusive mode",
      );
      const balance = await client.query(
        "select coalesce(sum(case when type='topup' then amount_cents else -amount_cents end),0)::bigint as amount from wallet_transactions where org_id=$1 and status='completed'",
        [input.orgId],
      );
      if (Number(balance.rows[0].amount) < MULTIWAN_PRICE_FCFA)
        throw new Error(
          "Solde portefeuille insuffisant. Rechargez votre compte.",
        );
      await client.query(
        "insert into wallet_transactions(org_id,type,purpose,amount_cents,status,payment_reference,note,created_by) values($1,'charge','multiwan',$2,'completed',$3,'Multi-WAN Premium — paiement unique par routeur',$4)",
        [input.orgId, MULTIWAN_PRICE_FCFA, reference, input.userId],
      );
    } else {
      const settings = await client.query(
        "select rate_fcfa_per_sc from safecoin_settings limit 1 for share",
      );
      rate = settings.rows[0]?.rate_fcfa_per_sc ?? DEFAULT_SC_RATE_FCFA;
      if (rate !== input.quotedRate)
        throw new Error(
          "Le taux SafeCoin a changé. Actualisez le devis avant de confirmer.",
        );
      scCost = fcfaToScCents(MULTIWAN_PRICE_FCFA, rate!);
      const account = await client.query(
        "update safecoin_accounts set balance_sc_cents=balance_sc_cents-$2,updated_at=now() where org_id=$1 and status='active' and balance_sc_cents>=$2 returning id",
        [input.orgId, scCost],
      );
      if (!account.rowCount)
        throw new Error("Solde SafeCoin insuffisant ou compte inactif.");
      await client.query(
        "insert into safecoin_ledger(account_id,org_id,entry_type,amount_sc_cents,reference_fcfa_cents,status,idempotency_key,reference_type,reference_id,note,created_by) values($1,$2,'multiwan_charge',$3,$4,'completed',$5,'multiwan',$6,'Multi-WAN Premium — paiement unique par routeur',$7)",
        [
          account.rows[0].id,
          input.orgId,
          -scCost,
          MULTIWAN_PRICE_FCFA,
          reference,
          input.routerId,
          input.userId,
        ],
      );
    }
    await client.query(
      "insert into router_multiwan_licenses(org_id,router_id,purchased_by,amount_fcfa,payment_source,sc_cents,rate_fcfa_per_sc,payment_reference) values($1,$2,$3,$4,$5,$6,$7,$8)",
      [
        input.orgId,
        input.routerId,
        input.userId,
        MULTIWAN_PRICE_FCFA,
        input.source,
        scCost,
        rate,
        reference,
      ],
    );
    await client.query("commit");
    return { alreadyPaid: false };
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}
export async function purchaseMultiwan(input: MultiwanPurchase) {
  const connection = await billingPool().connect();
  try {
    return await purchaseMultiwanOnConnection(connection, input);
  } finally {
    connection.release();
  }
}
