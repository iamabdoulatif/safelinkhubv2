"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { getDb } from "@/lib/db";
import { walletTransactions } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import { createGeniusPayment, isGeniusPayCheckoutEnabled } from "@/lib/payment-gateways/geniuspay";
import {
  getWalletPaymentMethodLabel,
  isWalletEligibleCountry,
  isWalletPaymentMethod,
} from "./payment-options";

export async function getWalletBalanceCents(orgId: string) {
  const db = getDb();
  const rows = await db
    .select({ type: walletTransactions.type, amountCents: walletTransactions.amountCents })
    .from(walletTransactions)
    .where(and(eq(walletTransactions.orgId, orgId), eq(walletTransactions.status, "completed")));

  return rows.reduce(
    (sum, r) => sum + (r.type === "topup" ? r.amountCents : -r.amountCents),
    0,
  );
}

/** Enregistre un dépôt confirmé manuellement par l'équipe SafeLinkHub. */
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

/** Démarre un dépôt portefeuille via le compte plateforme Genius Pay. */
export async function startWalletTopupPayment(_prevState: unknown, formData: FormData): Promise<
  { paymentUrl: string } | { error: string }
> {
  const session = await getSession();
  if (!session) return { error: "Non authentifié." };
  if (!isGeniusPayCheckoutEnabled()) {
    return { error: "Le paiement en ligne du portefeuille n'est pas encore activé." };
  }

  const amountCents = Math.round(Number(formData.get("amount") ?? 0));
  const paymentMethod = String(formData.get("paymentMethod") ?? "");
  const countryIso2 = String(formData.get("countryIso2") ?? "").toUpperCase();
  if (!Number.isInteger(amountCents) || amountCents < 100) {
    return { error: "Le montant minimum est de 100 FCFA." };
  }
  if (amountCents > 5_000_000) {
    return { error: "Le montant maximum par dépôt est de 5 000 000 FCFA." };
  }
  if (!isWalletPaymentMethod(paymentMethod)) return { error: "Moyen de paiement invalide." };
  if (!isWalletEligibleCountry(countryIso2)) return { error: "Pays non éligible pour ce paiement." };

  const db = getDb();
  const [pending] = await db
    .insert(walletTransactions)
    .values({
      orgId: session.orgId,
      type: "topup",
      amountCents,
      note: `Dépôt portefeuille — ${getWalletPaymentMethodLabel(paymentMethod)}`,
      status: "pending",
      paymentMethod,
      countryIso2,
      createdBy: session.userId,
    })
    .returning({ id: walletTransactions.id });

  const hdrs = await headers();
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "";
  const proto = hdrs.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = host ? `${proto}://${host}` : "";
  const returnUrl = origin
    ? `${origin}/admin/billing?topup=success&transaction=${pending.id}`
    : undefined;
  const payment = await createGeniusPayment({
    amountFcfa: amountCents,
    description: `Recharge portefeuille SafeLinkHub — ${amountCents.toLocaleString("fr-FR")} FCFA`,
    customer: { name: session.name, email: session.email, country: countryIso2 },
    paymentMethod,
    metadata: {
      kind: "wallet_topup",
      walletTransactionId: pending.id,
      orgId: session.orgId,
      countryIso2,
    },
    successUrl: returnUrl,
    errorUrl: returnUrl,
  });

  if (!payment.ok) {
    await db
      .update(walletTransactions)
      .set({ status: "failed", note: `Dépôt refusé : ${payment.error}` })
      .where(eq(walletTransactions.id, pending.id));
    return { error: payment.error };
  }

  await db
    .update(walletTransactions)
    .set({ paymentReference: payment.reference })
    .where(eq(walletTransactions.id, pending.id));
  return { paymentUrl: payment.paymentUrl };
}

/** Crédite un dépôt une seule fois après validation du webhook Genius Pay. */
export async function completeWalletTopupByReference(paymentReference: string): Promise<boolean> {
  if (!paymentReference) return false;
  const db = getDb();
  const [row] = await db
    .update(walletTransactions)
    .set({ status: "completed", note: "Dépôt portefeuille confirmé par Genius Pay" })
    .where(
      and(
        eq(walletTransactions.type, "topup"),
        eq(walletTransactions.status, "pending"),
        eq(walletTransactions.paymentReference, paymentReference),
      ),
    )
    .returning({ orgId: walletTransactions.orgId });
  if (!row) return false;
  revalidatePath("/admin/billing");
  return true;
}
