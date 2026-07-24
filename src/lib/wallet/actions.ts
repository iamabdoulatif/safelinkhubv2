"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { headers } from "next/headers";
import { getDb } from "@/lib/db";
import { walletTransactions } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import {
  createPlatformV3Payment,
  getPlatformV3PaymentStatus,
  isGeniusPayCheckoutEnabled,
} from "@/lib/payment-gateways/geniuspay";
import { COUNTRIES } from "@/lib/intl/countries";
import {
  getWalletPaymentMethodLabel,
  isWalletEligibleCountry,
  isWalletPaymentMethod,
} from "./payment-options";

// Moyens mobile money via PawaPay : GeniusPay v3 EXIGE un numéro (phone_number).
// Sans lui, l'API renvoie « PawaPay: Missing required field: phone_number ».
const MOBILE_MONEY_METHODS = new Set(["orange_money", "mtn_money"]);

/** Reconstitue le numéro international (indicatif du pays + numéro local). */
function toIntlPhone(localRaw: string, countryIso2: string): string {
  const dial = (COUNTRIES.find((c) => c.iso2 === countryIso2)?.dialCode ?? "").replace(/[^0-9]/g, "");
  const local = localRaw.replace(/[^0-9]/g, "");
  if (!local) return "";
  if (!dial || local.startsWith(dial)) return `+${local}`;
  return `+${dial}${local}`;
}

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

const EDITABLE_STATUSES = ["pending", "completed", "failed"] as const;
type EditableStatus = (typeof EDITABLE_STATUSES)[number];

/**
 * Supprime une transaction du journal — UNIQUEMENT si elle est « en attente »
 * ou « échouée ». Ces statuts ne comptent PAS dans le solde (seules les
 * `completed` le font), donc la suppression ne fausse jamais le solde. Les
 * dépôts confirmés et les débits VPN/Auto-Setup sont volontairement protégés.
 */
export async function deleteWalletTransaction(_prevState: unknown, formData: FormData) {
  const session = await getSession();
  if (!session) return { error: "Non authentifié." };
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { error: "Transaction manquante." };

  const db = getDb();
  const [deleted] = await db
    .delete(walletTransactions)
    .where(
      and(
        eq(walletTransactions.id, id),
        eq(walletTransactions.orgId, session.orgId),
        inArray(walletTransactions.status, ["pending", "failed"]),
      ),
    )
    .returning({ id: walletTransactions.id });
  if (!deleted) {
    return { error: "Seules les transactions en attente ou échouées peuvent être supprimées." };
  }
  revalidatePath("/admin/billing");
  return { success: true };
}

/** Nettoie en lot TOUTES les transactions en attente/échouées de l'org. */
export async function cleanupWalletTransactions() {
  const session = await getSession();
  if (!session) return { error: "Non authentifié." };

  const db = getDb();
  const rows = await db
    .delete(walletTransactions)
    .where(
      and(
        eq(walletTransactions.orgId, session.orgId),
        inArray(walletTransactions.status, ["pending", "failed"]),
      ),
    )
    .returning({ id: walletTransactions.id });
  revalidatePath("/admin/billing");
  return { success: true, count: rows.length };
}

/**
 * Édite une transaction : note + montant + statut. ⚠️ Changer le montant ou
 * passer une transaction en « completed » MODIFIE le solde (calculé comme la
 * somme des transactions confirmées) — puissant, réservé à l'admin de l'org.
 */
export async function updateWalletTransaction(_prevState: unknown, formData: FormData) {
  const session = await getSession();
  if (!session) return { error: "Non authentifié." };
  const id = String(formData.get("id") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  const amountCents = Math.round(Number(formData.get("amount") ?? 0));
  const status = String(formData.get("status") ?? "").trim();
  if (!id) return { error: "Transaction manquante." };
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    return { error: "Le montant doit être supérieur à 0." };
  }
  if (!EDITABLE_STATUSES.includes(status as EditableStatus)) {
    return { error: "Statut invalide." };
  }

  const db = getDb();
  const [updated] = await db
    .update(walletTransactions)
    .set({ note: note || null, amountCents, status })
    .where(and(eq(walletTransactions.id, id), eq(walletTransactions.orgId, session.orgId)))
    .returning({ id: walletTransactions.id });
  if (!updated) return { error: "Transaction introuvable." };
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
  // Minimum GeniusPay v3 = 200 FCFA (l'API rejette 422 en dessous).
  if (!Number.isInteger(amountCents) || amountCents < 200) {
    return { error: "Le montant minimum est de 200 FCFA." };
  }
  if (amountCents > 5_000_000) {
    return { error: "Le montant maximum par dépôt est de 5 000 000 FCFA." };
  }
  if (!isWalletPaymentMethod(paymentMethod)) return { error: "Moyen de paiement invalide." };
  if (!isWalletEligibleCountry(countryIso2)) return { error: "Pays non éligible pour ce paiement." };

  // Numéro mobile money : requis pour Orange/MTN (PawaPay). Optionnel sinon
  // (Wave n'en a pas besoin ; Moov/carte passent par le checkout hébergé).
  const phone = toIntlPhone(String(formData.get("phone") ?? ""), countryIso2);
  if (MOBILE_MONEY_METHODS.has(paymentMethod) && phone.replace(/[^0-9]/g, "").length < 8) {
    return { error: "Numéro mobile money requis pour Orange Money et MTN MoMo." };
  }

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
  const payment = await createPlatformV3Payment({
    amountFcfa: amountCents,
    description: `Recharge portefeuille SafeLinkHub — ${amountCents.toLocaleString("fr-FR")} FCFA`,
    customer: {
      name: session.name,
      email: session.email,
      country: countryIso2,
      ...(phone ? { phone } : {}),
    },
    method: paymentMethod,
    countryIso2,
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

/**
 * Confirme un dépôt AU RETOUR du checkout : re-vérifie le paiement auprès de
 * GeniusPay v3 (comme le portail sonde son statut) et crédite si c'est réglé —
 * indépendamment du webhook, qui n'est pas garanti sur le host v3. Idempotent.
 */
export async function confirmWalletTopupPayment(
  transactionId: string,
): Promise<{ status: "completed" | "pending" | "failed" }> {
  const session = await getSession();
  if (!session || !transactionId) return { status: "pending" };

  const db = getDb();
  const [txn] = await db
    .select({
      id: walletTransactions.id,
      status: walletTransactions.status,
      paymentReference: walletTransactions.paymentReference,
    })
    .from(walletTransactions)
    .where(
      and(
        eq(walletTransactions.id, transactionId),
        eq(walletTransactions.orgId, session.orgId),
        eq(walletTransactions.type, "topup"),
      ),
    )
    .limit(1);
  if (!txn) return { status: "pending" };
  if (txn.status === "completed") return { status: "completed" };
  if (txn.status === "failed") return { status: "failed" };
  if (!txn.paymentReference) return { status: "pending" };

  const gp = await getPlatformV3PaymentStatus(txn.paymentReference);
  if (!gp.ok) return { status: "pending" }; // erreur transitoire → le client re-sonde
  if (gp.status === "completed") {
    await completeWalletTopupByReference(txn.paymentReference);
    return { status: "completed" };
  }
  if (gp.status === "failed") {
    await db
      .update(walletTransactions)
      .set({ status: "failed", note: "Dépôt échoué ou annulé." })
      .where(and(eq(walletTransactions.id, txn.id), eq(walletTransactions.status, "pending")));
    revalidatePath("/admin/billing");
    return { status: "failed" };
  }
  return { status: "pending" };
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
