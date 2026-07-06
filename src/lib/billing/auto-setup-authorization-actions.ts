"use server";

// TEMPORAIRE — server actions de la porte d'autorisation Auto-Setup.
// TODO: Remplacer par système de paiement intégré.

import { put } from "@vercel/blob";
import { Resend } from "resend";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { routers } from "@/lib/db/schema";
import { getSession, isSuperAdmin } from "@/lib/auth/session";
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
}> {
  const c = getAutoSetupGateConfig();
  return {
    priceWithContainerFcfa: c.priceWithContainerFcfa,
    priceWithoutContainerFcfa: c.priceWithoutContainerFcfa,
    whatsappNumber: c.whatsappNumber,
  };
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
