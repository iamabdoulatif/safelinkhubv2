"use server";

// TEMPORAIRE — server actions de la porte d'autorisation des accès distants.
// TODO: Remplacer par système de paiement intégré.

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { routers } from "@/lib/db/schema";
import { getSession, isSuperAdmin } from "@/lib/auth/session";
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
): Promise<{ superadmin: boolean; authorized: boolean; latestStatus: string | null }> {
  const session = await getSession();
  const status = await getRemoteAccessGateStatus(session, routerId, service);
  return {
    superadmin: status.superadmin,
    authorized: status.authorized,
    latestStatus: status.latest?.status ?? null,
  };
}

/** Config publique (WhatsApp) — jamais l'email admin. */
export async function getRemoteAccessContactPublic(): Promise<{ whatsappNumber: string }> {
  return { whatsappNumber: getManualPaymentContact().whatsappNumber };
}
