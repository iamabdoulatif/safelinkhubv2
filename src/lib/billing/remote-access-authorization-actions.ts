"use server";

// TEMPORAIRE — server actions de la porte d'autorisation des accès distants.
// TODO: Remplacer par système de paiement intégré.

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getDb } from "@/lib/db";
import { routers, remoteAccessAuthorizations, walletTransactions, safecoinSettings } from "@/lib/db/schema";
import { getSession, isSuperAdmin } from "@/lib/auth/session";
import { createGeniusPayment, isGeniusPayCheckoutEnabled } from "@/lib/payment-gateways/geniuspay";
import { getWalletBalanceCents } from "@/lib/wallet/actions";
import { getSafecoinBalance, appendSafecoinDebit } from "@/lib/safecoin/ledger";
import { vpnActivationChargeScCents } from "@/lib/safecoin/service-charges";
import { scCentsToFcfa } from "@/lib/safecoin/pricing";
import { DEFAULT_SC_RATE_FCFA } from "@/lib/safecoin/constants";
import {
  createPendingRemoteAccessPayment,
  attachRemoteAccessPaymentReference,
  createApprovedRemoteAccessAuthorization,
  markRemoteAccessAuthorizationRejected,
} from "./remote-access-authorization-service";
import {
  buildWhatsappLink,
  formatFcfa,
  isPaymentMethod,
  PAYMENT_METHODS,
} from "./auto-setup-gate-config";
import {
  isRemoteAccessService,
  isBillingPeriod,
  remoteAccessPriceFcfa,
  serviceLabel,
  periodLabel,
} from "./remote-access-gate-config";
import {
  getManualPaymentContact,
  sendManualAuthEmail,
  uploadPaymentProof,
} from "./manual-payment";
import {
  createRemoteAccessAuthorizationRequest,
  decideRemoteAccessAuthorization,
  getRemoteAccessGateStatus,
} from "./remote-access-authorization-service";

export async function submitRemoteAccessAuthorizationRequest(formData: FormData): Promise<
  | { success: true; requestId: string; whatsappUrl: string; emailSent: boolean; proofUploaded: boolean }
  | { error: string }
> {
  const session = await getSession();
  if (!session) return { error: "Non authentifié." };

  const routerId = String(formData.get("routerId") ?? "");
  const service = String(formData.get("service") ?? "");
  const billingPeriod = String(formData.get("billingPeriod") ?? "");
  const amountFcfa = Number(formData.get("amountFcfa"));
  const paymentMethod = String(formData.get("paymentMethod") ?? "");
  const proof = formData.get("proof");

  if (!routerId) return { error: "Routeur manquant." };
  if (!isRemoteAccessService(service)) return { error: "Service invalide." };
  if (!isBillingPeriod(billingPeriod)) return { error: "Durée invalide." };
  if (!isPaymentMethod(paymentMethod)) return { error: "Moyen de paiement invalide." };
  if (!Number.isInteger(amountFcfa) || amountFcfa <= 0) return { error: "Montant invalide." };

  const db = getDb();
  const [router] = await db
    .select({ id: routers.id, name: routers.name, orgId: routers.orgId })
    .from(routers)
    .where(and(eq(routers.id, routerId), eq(routers.orgId, session.orgId)))
    .limit(1);
  if (!router) return { error: "Routeur introuvable." };

  const uploaded = await uploadPaymentProof(proof, `remote-access-proofs/${routerId}-${service}`);
  if (uploaded.tooLarge) return { error: "La capture dépasse 5 Mo." };

  const request = await createRemoteAccessAuthorizationRequest({
    orgId: session.orgId,
    userId: session.userId,
    requesterEmail: session.email,
    requesterName: session.name,
    routerId: router.id,
    routerName: router.name,
    service,
    billingPeriod,
    amountFcfa,
    paymentMethod,
    proofUrl: uploaded.url,
  });

  const contact = getManualPaymentContact();
  const methodLabel = PAYMENT_METHODS.find((m) => m.id === paymentMethod)?.label ?? paymentMethod;
  const expected = remoteAccessPriceFcfa(billingPeriod);
  const lines = [
    "*Demande d'accès distant (VPN) — SafeLinkHub*",
    `Utilisateur : ${session.name} (${session.email})`,
    `Routeur : ${router.name}`,
    `Service : ${serviceLabel(service)}`,
    `Durée : ${periodLabel(billingPeriod)}`,
    `Tarif attendu : ${formatFcfa(expected)}`,
    `Montant payé : ${formatFcfa(amountFcfa)}`,
    `Moyen : ${methodLabel}`,
    uploaded.url ? `Preuve : ${uploaded.url}` : "Preuve : (jointe dans ce chat WhatsApp)",
    `Réf : ${request.id}`,
  ];
  const whatsappUrl = buildWhatsappLink(contact.whatsappNumber, lines.join("\n"));
  const emailSent = await sendManualAuthEmail(
    contact.adminEmail,
    "SafeLinkHub — Nouvelle demande d'accès distant (VPN)",
    lines.slice(1),
    uploaded.url,
  ).catch(() => false);

  revalidatePath("/admin/authorizations");
  return {
    success: true,
    requestId: request.id,
    whatsappUrl,
    emailSent,
    proofUploaded: Boolean(uploaded.url),
  };
}

export async function decideRemoteAccessAuthorizationAction(
  id: string,
  decision: "approved" | "rejected",
  note?: string,
): Promise<{ success: true } | { error: string }> {
  const session = await getSession();
  if (!isSuperAdmin(session?.role)) return { error: "Réservé au superadmin." };
  const row = await decideRemoteAccessAuthorization(id, decision, session!.userId, note);
  if (!row) return { error: "Demande introuvable ou déjà traitée." };
  revalidatePath("/admin/authorizations");
  revalidatePath("/admin/remote-access");
  return { success: true };
}

/** État de la porte pour un (routeur, service) (UI). */
export async function getRemoteAccessGateStatusAction(
  routerId: string,
  service: string,
): Promise<{
  superadmin: boolean;
  authorized: boolean;
  latestStatus: string | null;
  temporaryGrant: { expiresAt: string; reason: string } | null;
}> {
  const session = await getSession();
  const status = await getRemoteAccessGateStatus(session, routerId, service);
  return {
    superadmin: status.superadmin,
    authorized: status.authorized,
    latestStatus: status.latest?.status ?? null,
    temporaryGrant: status.temporaryGrant
      ? { expiresAt: status.temporaryGrant.expiresAt.toISOString(), reason: status.temporaryGrant.reason }
      : null,
  };
}

/** Config publique (WhatsApp) — jamais l'email admin. */
export async function getRemoteAccessContactPublic(): Promise<{ whatsappNumber: string }> {
  return { whatsappNumber: getManualPaymentContact().whatsappNumber };
}

/** Le paiement en ligne GeniusPay est-il VISIBLE (clés + drapeau d'activation) ? */
export async function getRemoteAccessPaymentConfigPublic(): Promise<{ geniusPayEnabled: boolean }> {
  return { geniusPayEnabled: isGeniusPayCheckoutEnabled() };
}

/**
 * Démarre un paiement GeniusPay pour un accès distant (org → plateforme).
 * Le tarif est imposé côté serveur (remoteAccessPriceFcfa), jamais fourni par
 * le client. Crée une demande "pending", ouvre un checkout GeniusPay et renvoie
 * son URL ; c'est le webhook payment.success qui approuvera la demande, après
 * quoi un nouveau clic sur le service ouvre l'accès (consommation de la porte).
 */
export async function startRemoteAccessPayment(formData: FormData): Promise<
  { paymentUrl: string } | { error: string }
> {
  const session = await getSession();
  if (!session) return { error: "Non authentifié." };

  const routerId = String(formData.get("routerId") ?? "");
  const service = String(formData.get("service") ?? "");
  const billingPeriod = String(formData.get("billingPeriod") ?? "");

  if (!routerId) return { error: "Routeur manquant." };
  if (!isRemoteAccessService(service)) return { error: "Service invalide." };
  if (!isBillingPeriod(billingPeriod)) return { error: "Durée invalide." };
  if (!isGeniusPayCheckoutEnabled()) {
    return { error: "Le paiement en ligne n'est pas encore disponible. Utilisez le paiement manuel." };
  }

  const db = getDb();
  const [router] = await db
    .select({ id: routers.id, name: routers.name, orgId: routers.orgId })
    .from(routers)
    .where(and(eq(routers.id, routerId), eq(routers.orgId, session.orgId)))
    .limit(1);
  if (!router) return { error: "Routeur introuvable." };

  const amountFcfa = remoteAccessPriceFcfa(billingPeriod);

  const row = await createPendingRemoteAccessPayment({
    orgId: session.orgId,
    userId: session.userId,
    requesterEmail: session.email,
    requesterName: session.name,
    routerId: router.id,
    routerName: router.name,
    service,
    billingPeriod,
    amountFcfa,
  });

  const hdrs = await headers();
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "";
  const proto = hdrs.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = host ? `${proto}://${host}` : "";
  const returnUrl = origin ? `${origin}/admin/remote-access` : undefined;

  const payment = await createGeniusPayment({
    amountFcfa,
    description: `Accès distant ${serviceLabel(service)} — ${periodLabel(billingPeriod)} — ${router.name ?? "routeur"}`,
    customer: { name: session.name, email: session.email },
    metadata: {
      kind: "remote_access",
      authorizationId: row.id,
      orgId: session.orgId,
      routerId: router.id,
      service,
      billingPeriod,
    },
    successUrl: returnUrl,
    errorUrl: returnUrl,
  });

  if (!payment.ok) {
    // Ne pas laisser une demande "pending" fantôme : on la marque rejetée.
    await db
      .update(remoteAccessAuthorizations)
      .set({ status: "rejected", adminNote: `Échec ouverture paiement : ${payment.error}` })
      .where(eq(remoteAccessAuthorizations.id, row.id));
    return { error: payment.error };
  }

  await attachRemoteAccessPaymentReference(row.id, payment.reference);
  return { paymentUrl: payment.paymentUrl };
}

/** Soldes de l'org (portefeuille FCFA + Safecoins) pour le paiement par solde. */
export async function getRemoteAccessBalancesPublic(): Promise<{
  walletFcfa: number;
  safecoinScCents: number;
  safecoinFcfa: number;
}> {
  const session = await getSession();
  if (!session) return { walletFcfa: 0, safecoinScCents: 0, safecoinFcfa: 0 };
  const [settings] = await getDb()
    .select({ rate: safecoinSettings.rateFcfaPerSc })
    .from(safecoinSettings)
    .limit(1);
  const rate = settings?.rate ?? DEFAULT_SC_RATE_FCFA;
  const [walletFcfa, safecoinScCents] = await Promise.all([
    getWalletBalanceCents(session.orgId),
    getSafecoinBalance(session.orgId),
  ]);
  return { walletFcfa, safecoinScCents, safecoinFcfa: scCentsToFcfa(safecoinScCents, rate) };
}

/**
 * Paie un accès distant DEPUIS LE SOLDE : débite le portefeuille FCFA en
 * priorité, sinon les Safecoins, puis APPROUVE l'autorisation immédiatement
 * (l'accès s'ouvre au prochain clic sur le service). Le tarif est imposé côté
 * serveur. Renvoie la source débitée, ou une erreur si les deux soldes sont
 * insuffisants.
 */
export async function payRemoteAccessFromBalance(formData: FormData): Promise<
  { success: true; source: "wallet" | "safecoin" } | { error: string }
> {
  const session = await getSession();
  if (!session) return { error: "Non authentifié." };

  const routerId = String(formData.get("routerId") ?? "");
  const service = String(formData.get("service") ?? "");
  const billingPeriod = String(formData.get("billingPeriod") ?? "");
  if (!routerId) return { error: "Routeur manquant." };
  if (!isRemoteAccessService(service)) return { error: "Service invalide." };
  if (!isBillingPeriod(billingPeriod)) return { error: "Durée invalide." };

  const db = getDb();
  const [router] = await db
    .select({ id: routers.id, name: routers.name, orgId: routers.orgId })
    .from(routers)
    .where(and(eq(routers.id, routerId), eq(routers.orgId, session.orgId)))
    .limit(1);
  if (!router) return { error: "Routeur introuvable." };

  const amountFcfa = remoteAccessPriceFcfa(billingPeriod);
  const scCost = await vpnActivationChargeScCents({ billingPeriod });
  const [walletBal, scBal] = await Promise.all([
    getWalletBalanceCents(session.orgId),
    getSafecoinBalance(session.orgId),
  ]);

  const source: "wallet" | "safecoin" | null =
    walletBal >= amountFcfa ? "wallet" : scBal >= scCost ? "safecoin" : null;
  if (!source) {
    return { error: "Solde insuffisant (portefeuille et Safecoins) pour cet accès." };
  }

  const auth = await createApprovedRemoteAccessAuthorization({
    orgId: session.orgId,
    userId: session.userId,
    requesterEmail: session.email,
    requesterName: session.name,
    routerId: router.id,
    routerName: router.name,
    service,
    billingPeriod,
    amountFcfa,
    paymentMethod: source,
    adminNote: source === "wallet" ? "Payé avec le portefeuille (FCFA)" : "Payé avec les Safecoins",
  });

  if (source === "wallet") {
    await db.insert(walletTransactions).values({
      orgId: session.orgId,
      type: "charge",
      amountCents: amountFcfa,
      status: "completed",
      note: `Accès distant ${serviceLabel(service)} — ${periodLabel(billingPeriod)} — ${router.name ?? "routeur"}`,
      createdBy: session.userId,
    });
  } else {
    const debit = await appendSafecoinDebit({
      orgId: session.orgId,
      userId: session.userId,
      entryType: "vpn_charge",
      amountScCents: scCost,
      referenceFcfaCents: amountFcfa,
      idempotencyKey: `remote-access:${auth.id}`,
      referenceType: "remote_access_authorization",
      referenceId: auth.id,
      note: `${serviceLabel(service)} — ${router.name ?? "routeur"}`,
    });
    if ("error" in debit) {
      await markRemoteAccessAuthorizationRejected(auth.id, "Débit Safecoin refusé (solde insuffisant).");
      return { error: "Solde Safecoin insuffisant." };
    }
  }

  revalidatePath("/admin/remote-access");
  revalidatePath("/admin/authorizations");
  return { success: true, source };
}
