import { and, desc, eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { safecoinAccounts, safecoinLedger } from "@/lib/db/schema";
import type { SafecoinEntryStatus, SafecoinEntryType } from "./constants";

export type LedgerInput = {
  orgId: string;
  userId?: string;
  entryType: SafecoinEntryType;
  amountScCents: number;
  referenceFcfaCents?: number;
  idempotencyKey: string;
  referenceType?: string;
  referenceId?: string;
  note?: string;
  status?: SafecoinEntryStatus;
  paymentReference?: string;
  paymentMethod?: string;
  countryIso2?: string;
};

export type LedgerAmount = { amountScCents: number; status: SafecoinEntryStatus };

export function computeLedgerBalance(rows: LedgerAmount[]) {
  return rows.reduce(
    (sum, row) => (row.status === "completed" ? sum + row.amountScCents : sum),
    0,
  );
}

export function canDebit(balanceScCents: number, debitScCents: number) {
  return Number.isInteger(balanceScCents) && Number.isInteger(debitScCents) && debitScCents > 0 && balanceScCents >= debitScCents;
}

export function signedAmount(kind: "credit" | "debit", amountScCents: number) {
  if (!Number.isInteger(amountScCents) || amountScCents <= 0) {
    throw new Error("Le montant SC doit être un entier positif.");
  }
  return kind === "credit" ? amountScCents : -amountScCents;
}

async function ensureAccountRow(orgId: string) {
  const db = getDb();
  await db
    .insert(safecoinAccounts)
    .values({ orgId })
    .onConflictDoNothing({ target: safecoinAccounts.orgId });
  const [account] = await db
    .select({ id: safecoinAccounts.id, balanceScCents: safecoinAccounts.balanceScCents })
    .from(safecoinAccounts)
    .where(eq(safecoinAccounts.orgId, orgId))
    .limit(1);
  if (!account) throw new Error("Impossible de créer le compte Safecoin.");
  return account;
}

export async function ensureSafecoinAccount(orgId: string) {
  return ensureAccountRow(orgId);
}

export async function getSafecoinBalance(orgId: string) {
  const account = await getSafecoinAccount(orgId);
  return account?.balanceScCents ?? 0;
}

export async function getSafecoinAccount(orgId: string) {
  const [account] = await getDb()
    .select({ balanceScCents: safecoinAccounts.balanceScCents })
    .from(safecoinAccounts)
    .where(eq(safecoinAccounts.orgId, orgId))
    .limit(1);
  return account ?? null;
}

function readFirstRow(result: { rows?: unknown[] }) {
  const row = result.rows?.[0];
  return row && typeof row === "object" ? (row as Record<string, unknown>) : {};
}

/**
 * Atomically updates the denormalized account and appends the ledger entry in
 * one PostgreSQL statement. Neon HTTP does not provide interactive
 * transactions, so the CTE is deliberately kept as one server-side unit.
 */
async function appendSignedEntry(input: LedgerInput, signedScCents: number) {
  if (!Number.isInteger(signedScCents) || signedScCents === 0) {
    throw new Error("Le montant SC doit être un entier non nul.");
  }
  if (!input.idempotencyKey.trim()) throw new Error("La clé d’idempotence est obligatoire.");

  const account = await ensureAccountRow(input.orgId);
  const db = getDb();
  const result = await db.execute(sql`
    WITH existing AS (
      SELECT id
      FROM safecoin_ledger
      WHERE idempotency_key = ${input.idempotencyKey}
      LIMIT 1
    ), updated AS (
      UPDATE safecoin_accounts
      SET balance_sc_cents = balance_sc_cents + ${signedScCents}, updated_at = now()
      WHERE id = ${account.id}
        AND NOT EXISTS (SELECT 1 FROM existing)
        ${signedScCents < 0 ? sql`AND balance_sc_cents >= ${Math.abs(signedScCents)}` : sql``}
      RETURNING id
    ), inserted AS (
      INSERT INTO safecoin_ledger (
        account_id, org_id, entry_type, amount_sc_cents, reference_fcfa_cents,
        status, idempotency_key, reference_type, reference_id, note,
        payment_reference, payment_method, country_iso2, created_by
      )
      SELECT
        ${account.id}, ${input.orgId}, ${input.entryType}, ${signedScCents},
        ${input.referenceFcfaCents ?? null}, ${input.status ?? "completed"},
        ${input.idempotencyKey}, ${input.referenceType ?? null}, ${input.referenceId ?? null},
        ${input.note ?? null}, ${input.paymentReference ?? null}, ${input.paymentMethod ?? null},
        ${input.countryIso2 ?? null}, ${input.userId ?? null}
      FROM updated
      RETURNING id
    )
    SELECT
      (SELECT id FROM existing LIMIT 1) AS existing_id,
      (SELECT id FROM inserted LIMIT 1) AS inserted_id,
      EXISTS (SELECT 1 FROM updated) AS balance_updated
  `);
  const row = readFirstRow(result);
  if (row.existing_id) return { created: false as const, entryId: String(row.existing_id) };
  if (!row.inserted_id) {
    return { created: false as const, error: "INSUFFICIENT_BALANCE" as const };
  }
  return { created: true as const, entryId: String(row.inserted_id) };
}

export async function appendSafecoinCredit(input: LedgerInput) {
  return appendSignedEntry(input, signedAmount("credit", input.amountScCents));
}

export async function appendSafecoinDebit(input: LedgerInput) {
  return appendSignedEntry(input, signedAmount("debit", input.amountScCents));
}

export async function reverseSafecoinEntry(entryId: string, userId: string, note: string) {
  const db = getDb();
  const [entry] = await db
    .select({
      orgId: safecoinLedger.orgId,
      amountScCents: safecoinLedger.amountScCents,
      referenceType: safecoinLedger.referenceType,
      referenceId: safecoinLedger.referenceId,
    })
    .from(safecoinLedger)
    .where(and(eq(safecoinLedger.id, entryId), eq(safecoinLedger.status, "completed")))
    .limit(1);
  if (!entry) return { error: "Écriture Safecoin introuvable." } as const;

  const result = await appendSignedEntry(
    {
      orgId: entry.orgId,
      userId,
      entryType: "reversal",
      amountScCents: Math.abs(entry.amountScCents),
      idempotencyKey: `reversal:${entryId}`,
      referenceType: entry.referenceType ?? "safecoin_ledger",
      referenceId: entry.referenceId ?? entryId,
      note: note.trim() || `Annulation de ${entryId}`,
    },
    -entry.amountScCents,
  );
  return result.created || !("error" in result)
    ? { success: true as const }
    : { error: result.error };
}

export async function listSafecoinLedger(orgId: string, limit = 50) {
  return getDb()
    .select()
    .from(safecoinLedger)
    .where(eq(safecoinLedger.orgId, orgId))
    .orderBy(desc(safecoinLedger.createdAt))
    .limit(Math.min(Math.max(limit, 1), 200));
}
