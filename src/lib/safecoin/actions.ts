"use server";

import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { safecoinAccounts, safecoinLedger, safecoinSettings } from "@/lib/db/schema";
import { getSession, isSuperAdmin } from "@/lib/auth/session";
import { createGeniusPayment, isGeniusPayCheckoutEnabled } from "@/lib/payment-gateways/geniuspay";
import {
  getWalletPaymentMethodLabel,
  isWalletEligibleCountry,
  isWalletPaymentMethod,
} from "@/lib/wallet/payment-options";
import { ensureSafecoinAccount, appendSafecoinCredit } from "./ledger";
import { parseSafecoinTopupAmount, safecoinTopupScCents } from "./topup";

async function currentRate() {
  const [settings] = await getDb()
    .select({ rateFcfaPerSc: safecoinSettings.rateFcfaPerSc })
    .from(safecoinSettings)
    .limit(1);
  return settings?.rateFcfaPerSc ?? 100;
}

function paymentOrigin(host: string | null, proto: string | null) {
  if (!host) return "";
  return `${proto ?? (host.startsWith("localhost") ? "http" : "https")}://${host}`;
}

export async function startSafecoinTopupPayment(_prevState: unknown, formData: FormData): Promise<
  { paymentUrl: string; pendingAmountScCents: number; status: "pending" } | { error: string }
> {
  const session = await getSession();
  if (!session) return { error: "Non authentifié." };
  if (!isGeniusPayCheckoutEnabled()) {
    return { error: "Le paiement Safecoin en ligne n'est pas encore activé." };
  }

  const paymentMethod = String(formData.get("paymentMethod") ?? "");
  const countryIso2 = String(formData.get("countryIso2") ?? "").toUpperCase();
  let amountFcfa: number;
  try {
    amountFcfa = parseSafecoinTopupAmount(String(formData.get("amount") ?? ""));
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Montant invalide." };
  }
  if (!isWalletPaymentMethod(paymentMethod)) return { error: "Moyen de paiement invalide." };
  if (!isWalletEligibleCountry(countryIso2)) return { error: "Pays non éligible pour ce paiement." };

  const rateFcfaPerSc = await currentRate();
  const amountScCents = safecoinTopupScCents(amountFcfa, rateFcfaPerSc);
  const account = await ensureSafecoinAccount(session.orgId);
  const db = getDb();
  const [pending] = await db
    .insert(safecoinLedger)
    .values({
      accountId: account.id,
      orgId: session.orgId,
      entryType: "topup",
      amountScCents,
      referenceFcfaCents: amountFcfa,
      status: "pending",
      idempotencyKey: `safecoin-topup:${randomUUID()}`,
      paymentMethod,
      countryIso2,
      note: `Recharge Safecoin — ${getWalletPaymentMethodLabel(paymentMethod)}`,
      createdBy: session.userId,
    })
    .returning({ id: safecoinLedger.id });

  const hdrs = await headers();
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host");
  const origin = paymentOrigin(host, hdrs.get("x-forwarded-proto"));
  const returnUrl = origin
    ? `${origin}/admin/billing?safecoin_topup=success&transaction=${pending.id}`
    : undefined;

  const payment = await createGeniusPayment({
    amountFcfa,
    description: `Recharge Safecoin — ${amountFcfa.toLocaleString("fr-FR")} FCFA`,
    customer: { name: session.name, email: session.email, country: countryIso2 },
    paymentMethod,
    metadata: {
      kind: "safecoin_topup",
      safecoinLedgerId: pending.id,
      orgId: session.orgId,
      countryIso2,
    },
    successUrl: returnUrl,
    errorUrl: returnUrl,
  });

  if (!payment.ok) {
    await db
      .update(safecoinLedger)
      .set({ status: "failed", note: `Recharge refusée : ${payment.error}` })
      .where(eq(safecoinLedger.id, pending.id));
    return { error: payment.error };
  }

  await db
    .update(safecoinLedger)
    .set({ paymentReference: payment.reference })
    .where(eq(safecoinLedger.id, pending.id));
  return { paymentUrl: payment.paymentUrl, pendingAmountScCents: amountScCents, status: "pending" };
}

export async function addSafecoinFundsManually(_prevState: unknown, formData: FormData) {
  const session = await getSession();
  if (!session) return { error: "Non authentifié." };
  let amountFcfa: number;
  try {
    amountFcfa = parseSafecoinTopupAmount(String(formData.get("amount") ?? ""));
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Montant invalide." };
  }
  const amountScCents = safecoinTopupScCents(amountFcfa, await currentRate());
  await appendSafecoinCredit({
    orgId: session.orgId,
    userId: session.userId,
    entryType: "topup",
    amountScCents,
    referenceFcfaCents: amountFcfa,
    idempotencyKey: `manual-safecoin:${session.orgId}:${randomUUID()}`,
    note: String(formData.get("note") ?? "Recharge manuelle Safecoin").trim() || "Recharge manuelle Safecoin",
  });
  revalidatePath("/admin/billing");
  return { success: true as const };
}

/** Confirme un dépôt une seule fois après le webhook GeniusPay signé. */
export async function completeSafecoinTopupByReference(paymentReference: string): Promise<boolean> {
  if (!paymentReference) return false;
  const db = getDb();
  const result = await db.execute(sql`
    WITH completed AS (
      UPDATE safecoin_ledger
      SET status = 'completed', note = 'Recharge Safecoin confirmée par GeniusPay'
      WHERE payment_reference = ${paymentReference}
        AND entry_type = 'topup'
        AND status = 'pending'
      RETURNING account_id, amount_sc_cents
    ), updated AS (
      UPDATE safecoin_accounts account
      SET balance_sc_cents = account.balance_sc_cents + completed.amount_sc_cents,
          updated_at = now()
      FROM completed
      WHERE account.id = completed.account_id
      RETURNING account.id
    )
    SELECT EXISTS (SELECT 1 FROM updated) AS completed
  `);
  const row = (result.rows?.[0] ?? {}) as { completed?: boolean };
  if (!row.completed) return false;
  revalidatePath("/admin/billing");
  return true;
}

export async function updateSafecoinSettings(_prevState: unknown, formData: FormData) {
  const session = await getSession();
  if (!isSuperAdmin(session?.role)) return { error: "Réservé au superadmin." };
  const rate = Number(formData.get("rateFcfaPerSc") ?? 0);
  const rechargeFee = Number(formData.get("rechargeFeeScCents") ?? 0);
  const vpnFee = Number(formData.get("vpnFeeScCents") ?? 0);
  const autoSetupFee = Number(formData.get("autoSetupFeeScCents") ?? 0);
  if (![rate, rechargeFee, vpnFee, autoSetupFee].every(Number.isInteger) || rate <= 0 || rechargeFee < 0 || vpnFee < 0 || autoSetupFee < 0) {
    return { error: "Paramètres Safecoin invalides." };
  }
  const db = getDb();
  const [current] = await db.select({ id: safecoinSettings.id, version: safecoinSettings.version }).from(safecoinSettings).limit(1);
  if (current) {
    await db.update(safecoinSettings).set({ rateFcfaPerSc: rate, rechargeFeeScCents: rechargeFee, vpnFeeScCents: vpnFee, autoSetupFeeScCents: autoSetupFee, version: current.version + 1, updatedBy: session!.userId, updatedAt: new Date() }).where(eq(safecoinSettings.id, current.id));
  } else {
    await db.insert(safecoinSettings).values({ rateFcfaPerSc: rate, rechargeFeeScCents: rechargeFee, vpnFeeScCents: vpnFee, autoSetupFeeScCents: autoSetupFee, updatedBy: session!.userId });
  }
  revalidatePath("/admin/safecoin");
  revalidatePath("/admin/billing");
  return { success: true as const };
}
