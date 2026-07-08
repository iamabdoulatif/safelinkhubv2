"use server";

// TEMPORAIRE — server actions de la porte d'autorisation générique
// (router_link / remote_access) : demande d'accès (sans paiement),
// notification admin (email Resend + lien WhatsApp), décision superadmin.
// TODO: Remplacer par système de paiement intégré.

import { Resend } from "resend";
import { revalidatePath } from "next/cache";
import { getSession, isSuperAdmin } from "@/lib/auth/session";
import { getManualPaymentContact } from "./manual-payment";
import { buildWhatsappLink } from "./auto-setup-gate-config";
import { featureAccessLabel, isFeatureAccess } from "./feature-access-config";
import {
  createFeatureAccessRequest,
  decideFeatureAccessAuthorization,
  getFeatureAccessGateStatus,
} from "./feature-access-service";

const MAX_NOTE_LENGTH = 1000;

export type RequestFeatureAccessResult =
  | { success: true; requestId: string; whatsappUrl: string; emailSent: boolean }
  | { error: string };

/**
 * Soumet une demande d'accès à une fonctionnalité verrouillée. Accessible à
 * tout utilisateur connecté. Notifie l'admin (email best-effort) et renvoie un
 * lien WhatsApp pré-rempli.
 */
export async function requestFeatureAccess(formData: FormData): Promise<RequestFeatureAccessResult> {
  const session = await getSession();
  if (!session) return { error: "Non authentifié." };

  const feature = String(formData.get("feature") ?? "");
  if (!isFeatureAccess(feature)) return { error: "Fonctionnalité invalide." };

  const note = String(formData.get("note") ?? "").trim().slice(0, MAX_NOTE_LENGTH) || null;

  const request = await createFeatureAccessRequest({
    orgId: session.orgId,
    userId: session.userId,
    requesterEmail: session.email,
    requesterName: session.name,
    feature,
    note,
  });

  const { whatsappNumber, adminEmail } = getManualPaymentContact();
  const label = featureAccessLabel(feature);
  const lines = [
    "*Demande d'accès — SafeLinkHub*",
    `Fonctionnalité : ${label}`,
    `Utilisateur : ${session.name} (${session.email})`,
    note ? `Message : ${note}` : "Message : (aucun)",
    `Réf : ${request.id}`,
  ];
  const whatsappUrl = buildWhatsappLink(whatsappNumber, lines.join("\n"));

  const emailSent = await sendAdminEmail(adminEmail, label, lines).catch(() => false);

  revalidatePath("/admin/authorizations");
  return { success: true, requestId: request.id, whatsappUrl, emailSent };
}

async function sendAdminEmail(
  adminEmail: string | null,
  featureLabel: string,
  lines: string[],
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !adminEmail) return false;
  const from = process.env.RESEND_FROM || "SafeLinkHub <onboarding@resend.dev>";
  const resend = new Resend(apiKey);
  const html = `<h2>Nouvelle demande d'accès — ${featureLabel}</h2><ul>${lines
    .slice(1)
    .map((l) => `<li>${l}</li>`)
    .join("")}</ul><p>Approuvez ou refusez depuis <strong>/admin/authorizations</strong>.</p>`;
  const { error } = await resend.emails.send({
    from,
    to: adminEmail,
    subject: `SafeLinkHub — Nouvelle demande d'accès (${featureLabel})`,
    html,
  });
  return !error;
}

/** Valide/refuse une demande d'accès. Superadmin uniquement. */
export async function decideFeatureAccess(
  id: string,
  decision: "approved" | "rejected",
  note?: string,
): Promise<{ success: true } | { error: string }> {
  const session = await getSession();
  if (!isSuperAdmin(session?.role)) return { error: "Réservé au superadmin." };
  const row = await decideFeatureAccessAuthorization(id, decision, session!.userId, note);
  if (!row) return { error: "Demande introuvable ou déjà traitée." };
  revalidatePath("/admin/authorizations");
  revalidatePath("/admin/router");
  revalidatePath("/admin/remote-access");
  revalidatePath("/admin/settings/router-setup");
  return { success: true };
}

/** État de la porte pour l'UI (client). */
export async function getFeatureAccessGateStatusAction(feature: string): Promise<{
  superadmin: boolean;
  authorized: boolean;
  latestStatus: string | null;
}> {
  if (!isFeatureAccess(feature)) {
    return { superadmin: false, authorized: false, latestStatus: null };
  }
  const session = await getSession();
  return getFeatureAccessGateStatus(session, feature);
}

/** Contact WhatsApp public (jamais l'email admin) pour le modal. */
export async function getManualAuthWhatsappNumber(): Promise<string> {
  return getManualPaymentContact().whatsappNumber;
}
