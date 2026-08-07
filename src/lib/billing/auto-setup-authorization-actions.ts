"use server";

// TEMPORAIRE — server actions de la porte d'autorisation Auto-Setup.
// TODO: Remplacer par système de paiement intégré.

import { put } from "@vercel/blob";
import { Resend } from "resend";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getDb } from "@/lib/db";
import { routers, autoSetupAuthorizations, walletTransactions, safecoinSettings } from "@/lib/db/schema";
import { getSession, isSuperAdmin } from "@/lib/auth/session";
import { createGeniusPayment, isGeniusPayCheckoutEnabled } from "@/lib/payment-gateways/geniuspay";
import { getWalletBalanceCents } from "@/lib/wallet/actions";
import { getSafecoinBalance } from "@/lib/safecoin/ledger";
import { autoSetupChargeScCents, chargeAutoSetup } from "@/lib/safecoin/service-charges";
import { scCentsToFcfa } from "@/lib/safecoin/pricing";
import { DEFAULT_SC_RATE_FCFA } from "@/lib/safecoin/constants";
import { pickBalanceSource } from "./balance-source";
import {
  autoSetupPriceFcfa,
  buildWhatsappLink,
  formatFcfa,
  getAutoSetupGateConfig,
  isPaymentMethod,
  mikrotikKindLabel,
  PAYMENT_METHODS,
} from "./auto-setup-gate-config";
import {
  createAuthorizationRequest,
  decideAuthorization,
  getAutoSetupGateStatusForRouter,
  createPendingAutoSetupPayment,
  attachAutoSetupPaymentReference,
  createApprovedAutoSetupAuthorization,
  markAutoSetupAuthorizationRejected,
  findUsableAuthorization,
} from "./auto-setup-authorization-service";

const MAX_PROOF_BYTES = 5 * 1024 * 1024; // 5 Mo

/**
 * Soumet une demande d'autorisation : téléverse la preuve, enregistre la
 * demande, prévient l'admin par email (best-effort) et renvoie un lien
 * WhatsApp pré-rempli. Accessible à tout utilisateur connecté.
 */
export async function submitAutoSetupAuthorizationRequest(formData: FormData): Promise<
  | { success: true; requestId: string; whatsappUrl: string; emailSent: boolean; proofUploaded: boolean }
  | { error: string }
> {
  const session = await getSession();
  if (!session) return { error: "Non authentifié." };

  const routerId = String(formData.get("routerId") ?? "");
  const supportsContainers = String(formData.get("supportsContainers") ?? "") === "1";
  const amountFcfa = Number(formData.get("amountFcfa"));
  const paymentMethod = String(formData.get("paymentMethod") ?? "");
  const proof = formData.get("proof");

  if (!routerId) return { error: "Routeur manquant." };
  if (!isPaymentMethod(paymentMethod)) return { error: "Moyen de paiement invalide." };
  if (!Number.isInteger(amountFcfa) || amountFcfa <= 0) {
    return { error: "Montant invalide." };
  }

  const db = getDb();
  const [router] = await db
    .select({ id: routers.id, name: routers.name, orgId: routers.orgId })
    .from(routers)
    .where(and(eq(routers.id, routerId), eq(routers.orgId, session.orgId)))
    .limit(1);
  if (!router) return { error: "Routeur introuvable." };

  const config = getAutoSetupGateConfig();

  // Preuve de paiement (optionnelle si le stockage n'est pas configuré — la
  // preuve part aussi par WhatsApp, donc on ne bloque pas la demande).
  let proofUrl: string | null = null;
  let proofUploaded = false;
  if (proof instanceof File && proof.size > 0) {
    if (proof.size > MAX_PROOF_BYTES) {
      return { error: "La capture dépasse 5 Mo." };
    }
    try {
      const ext = proof.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
      const blob = await put(`auto-setup-proofs/${routerId}-${Date.now()}.${ext}`, proof, {
        access: "public",
        addRandomSuffix: true,
        token: process.env.BLOB_READ_WRITE_TOKEN,
      });
      proofUrl = blob.url;
      proofUploaded = true;
    } catch {
      // Stockage indisponible : on continue sans preuve stockée.
      proofUrl = null;
    }
  }

  const request = await createAuthorizationRequest({
    orgId: session.orgId,
    userId: session.userId,
    requesterEmail: session.email,
    requesterName: session.name,
    routerId: router.id,
    routerName: router.name,
    supportsContainers,
    amountFcfa,
    paymentMethod,
    proofUrl,
  });

  const methodLabel = PAYMENT_METHODS.find((m) => m.id === paymentMethod)?.label ?? paymentMethod;
  const expected = autoSetupPriceFcfa(config, supportsContainers);
  const lines = [
    "*Demande d'autorisation Auto-Setup — SafeLinkHub*",
    `Utilisateur : ${session.name} (${session.email})`,
    `Routeur : ${router.name}`,
    `Type MikroTik : ${mikrotikKindLabel(supportsContainers)}`,
    `Tarif attendu : ${formatFcfa(expected)}`,
    `Montant payé : ${formatFcfa(amountFcfa)}`,
    `Moyen : ${methodLabel}`,
    proofUrl ? `Preuve : ${proofUrl}` : "Preuve : (jointe dans ce chat WhatsApp)",
    `Réf : ${request.id}`,
  ];
  const whatsappUrl = buildWhatsappLink(config.whatsappNumber, lines.join("\n"));

  // Email d'autorisation à l'admin (best-effort — ne bloque pas la demande).
  const emailSent = await sendAdminEmail(config.adminEmail, lines, proofUrl).catch(() => false);

  revalidatePath("/admin/authorizations");
  return { success: true, requestId: request.id, whatsappUrl, emailSent, proofUploaded };
}

async function sendAdminEmail(
  adminEmail: string | null,
  lines: string[],
  proofUrl: string | null,
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !adminEmail) return false;
  const from = process.env.RESEND_FROM || "SafeLinkHub <onboarding@resend.dev>";
  const resend = new Resend(apiKey);
  const html = `<h2>Demande d'autorisation Auto-Setup</h2><ul>${lines
    .slice(1)
    .map((l) => `<li>${l}</li>`)
    .join("")}</ul>${proofUrl ? `<p><a href="${proofUrl}">Voir la preuve de paiement</a></p>` : ""}`;
  const { error } = await resend.emails.send({
    from,
    to: adminEmail,
    subject: "SafeLinkHub — Nouvelle demande d'autorisation Auto-Setup",
    html,
  });
  return !error;
}

/** Valide/refuse une demande. Superadmin uniquement. */
export async function decideAutoSetupAuthorization(
  id: string,
  decision: "approved" | "rejected",
  note?: string,
): Promise<{ success: true } | { error: string }> {
  const session = await getSession();
  if (!isSuperAdmin(session?.role)) return { error: "Réservé au superadmin." };
  const row = await decideAuthorization(id, decision, session!.userId, note);
  if (!row) return { error: "Demande introuvable ou déjà traitée." };
  revalidatePath("/admin/authorizations");
  revalidatePath("/admin/settings/router-setup");
  return { success: true };
}

/** Config publique (tarifs + WhatsApp) pour le modal — jamais l'email admin. */
export async function getAutoSetupGateConfigPublic(): Promise<{
  priceWithContainerFcfa: number;
  priceWithoutContainerFcfa: number;
  whatsappNumber: string;
  geniusPayEnabled: boolean;
}> {
  const c = getAutoSetupGateConfig();
  return {
    priceWithContainerFcfa: c.priceWithContainerFcfa,
    priceWithoutContainerFcfa: c.priceWithoutContainerFcfa,
    whatsappNumber: c.whatsappNumber,
    geniusPayEnabled: isGeniusPayCheckoutEnabled(),
  };
}

/**
 * Démarre un paiement GeniusPay pour débloquer l'Auto-Setup (org → plateforme).
 * Le tarif est imposé côté serveur selon le type de MikroTik ; le webhook
 * payment.success approuve ensuite la demande, après quoi l'auto-setup passe la
 * porte (et la consomme).
 */
export async function startAutoSetupPayment(formData: FormData): Promise<
  { paymentUrl: string } | { error: string }
> {
  const session = await getSession();
  if (!session) return { error: "Non authentifié." };

  const routerId = String(formData.get("routerId") ?? "");
  const supportsContainers = String(formData.get("supportsContainers") ?? "") === "1";
  if (!routerId) return { error: "Routeur manquant." };
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

  const amountFcfa = autoSetupPriceFcfa(getAutoSetupGateConfig(), supportsContainers);

  const row = await createPendingAutoSetupPayment({
    orgId: session.orgId,
    userId: session.userId,
    requesterEmail: session.email,
    requesterName: session.name,
    routerId: router.id,
    routerName: router.name,
    supportsContainers,
    amountFcfa,
  });

  const hdrs = await headers();
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "";
  const proto = hdrs.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = host ? `${proto}://${host}` : "";
  // Retour APRÈS paiement : on ramène l'admin sur le wizard du BON routeur, à
  // l'étape 3 (configuration automatique) — sinon la page rouvre l'étape 2
  // (topologie) et l'admin doit tout re-parcourir. L'étape 3 restaure ses champs
  // depuis sessionStorage (voir AutoSetupStep).
  const returnUrl = origin
    ? `${origin}/admin/settings/router-setup?router=${router.id}&etape=3`
    : undefined;

  const payment = await createGeniusPayment({
    amountFcfa,
    description: `Auto-Setup ${mikrotikKindLabel(supportsContainers)} — ${router.name ?? "routeur"}`,
    customer: { name: session.name, email: session.email },
    metadata: {
      kind: "auto_setup",
      authorizationId: row.id,
      orgId: session.orgId,
      routerId: router.id,
    },
    successUrl: returnUrl,
    errorUrl: returnUrl,
  });

  if (!payment.ok) {
    await db
      .update(autoSetupAuthorizations)
      .set({ status: "rejected", adminNote: `Échec ouverture paiement : ${payment.error}` })
      .where(eq(autoSetupAuthorizations.id, row.id));
    return { error: payment.error };
  }

  await attachAutoSetupPaymentReference(row.id, payment.reference);
  return { paymentUrl: payment.paymentUrl };
}

/**
 * Soldes de l'org pour le paiement « depuis le solde » du paywall Auto-Setup.
 * Le montant Safecoin est converti en FCFA au taux courant, uniquement pour
 * l'affichage — le débit, lui, se fait en SC (frais de service inclus).
 */
export async function getAutoSetupBalancesPublic(): Promise<{
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
 * Paie l'Auto-Setup DEPUIS LE SOLDE : débite le portefeuille FCFA en priorité,
 * sinon les Safecoins, puis crée une autorisation DÉJÀ APPROUVÉE — l'assistant
 * passe la porte immédiatement, sans checkout externe ni validation admin.
 * Même contrat que payRemoteAccessFromBalance, pour que les deux parcours
 * payants du produit se comportent pareil.
 *
 * Le tarif est imposé côté serveur (le client n'envoie que le routeur et sa
 * capacité container). Aucun double débit possible : une fois l'autorisation
 * approuvée, evaluateAutoSetupGate renvoie "authorized" et provisionHotspotStack
 * met billableCents à null — le prélèvement d'exécution est court-circuité.
 */
export async function payAutoSetupFromBalance(formData: FormData): Promise<
  { success: true; source: "wallet" | "safecoin" } | { error: string }
> {
  const session = await getSession();
  if (!session) return { error: "Non authentifié." };

  const routerId = String(formData.get("routerId") ?? "");
  const supportsContainers = String(formData.get("supportsContainers") ?? "") === "1";
  if (!routerId) return { error: "Routeur manquant." };

  const db = getDb();
  const [router] = await db
    .select({ id: routers.id, name: routers.name, orgId: routers.orgId })
    .from(routers)
    .where(and(eq(routers.id, routerId), eq(routers.orgId, session.orgId)))
    .limit(1);
  if (!router) return { error: "Routeur introuvable." };

  // Déjà payé et pas encore consommé : ne pas débiter une seconde fois. Le
  // débit Safecoin est idempotent par routeur (clé `auto-setup:<routerId>`),
  // mais rien n'empêcherait un second débit du PORTEFEUILLE sans ce garde-fou.
  const existing = await findUsableAuthorization(router.id, session.userId);
  if (existing) {
    return { error: "Cette configuration est déjà payée — relancez simplement l'auto-setup." };
  }

  const amountFcfa = autoSetupPriceFcfa(getAutoSetupGateConfig(), supportsContainers);
  const scCost = await autoSetupChargeScCents({ supportsContainers });
  const [walletBal, scBal] = await Promise.all([
    getWalletBalanceCents(session.orgId),
    getSafecoinBalance(session.orgId),
  ]);

  const source = pickBalanceSource({
    walletFcfa: walletBal,
    amountFcfa,
    safecoinScCents: scBal,
    requiredScCents: scCost,
  });
  if (!source) {
    return { error: "Solde insuffisant (portefeuille et Safecoins) pour cette configuration." };
  }

  const auth = await createApprovedAutoSetupAuthorization({
    orgId: session.orgId,
    userId: session.userId,
    requesterEmail: session.email,
    requesterName: session.name,
    routerId: router.id,
    routerName: router.name,
    supportsContainers,
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
      note: `Configuration automatique — ${router.name ?? "routeur"} (${mikrotikKindLabel(supportsContainers)})`,
      createdBy: session.userId,
    });
  } else {
    const debit = await chargeAutoSetup({
      orgId: session.orgId,
      userId: session.userId,
      routerId: router.id,
      supportsContainers,
    });
    if ("error" in debit) {
      await markAutoSetupAuthorizationRejected(
        auth.id,
        "Débit Safecoin refusé (solde insuffisant).",
      );
      return { error: "Solde Safecoin insuffisant." };
    }
  }

  revalidatePath("/admin/settings/router-setup");
  revalidatePath("/admin/authorizations");
  return { success: true, source };
}

/** État de la porte pour un routeur (UI). */
export async function getAutoSetupGateStatus(routerId: string): Promise<{
  superadmin: boolean;
  authorized: boolean;
  latestStatus: string | null;
}> {
  const session = await getSession();
  const status = await getAutoSetupGateStatusForRouter(session, routerId);
  return {
    superadmin: status.superadmin,
    authorized: status.authorized,
    latestStatus: status.latest?.status ?? null,
  };
}
