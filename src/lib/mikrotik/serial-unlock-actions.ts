"use server";

// Server actions du déblocage (support) d'un verrou de série MikroTik :
// - requestSerialUnlock : tout utilisateur connecté et bloqué demande la
//   réinitialisation du SN (notifie l'admin par email Resend + lien WhatsApp) ;
// - decideSerialUnlock : le superadmin valide (→ libère le verrou) ou refuse ;
// - getSerialUnlockStatus : état de la dernière demande pour l'UI.

import { Resend } from "resend";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { routers } from "@/lib/db/schema";
import { getSession, isSuperAdmin } from "@/lib/auth/session";
import { getManualPaymentContact } from "@/lib/billing/manual-payment";
import { buildWhatsappLink } from "@/lib/billing/auto-setup-gate-config";
import {
  createSerialUnlockRequest,
  decideSerialUnlockRequest,
  getLatestSerialUnlockRequest,
  isSerialLockedByAnotherOrg,
} from "./serial-unlock-service";

const MAX_NOTE_LENGTH = 1000;
const SERIAL_RE = /^[A-Za-z0-9-]{1,64}$/;

export type RequestSerialUnlockResult =
  | { success: true; requestId: string; whatsappUrl: string; emailSent: boolean }
  | { error: string };

/**
 * Soumet une demande de déblocage pour un MikroTik (par numéro de série) rattaché
 * à un autre compte. Le SN doit être ACTUELLEMENT verrouillé par un autre org
 * (défensif : on ne crée pas de demande fantôme pour un appareil déjà libre ou
 * déjà rattaché au demandeur). Le routeur, s'il est fourni, doit appartenir au
 * demandeur.
 */
export async function requestSerialUnlock(formData: FormData): Promise<RequestSerialUnlockResult> {
  const session = await getSession();
  if (!session) return { error: "Non authentifié." };

  const serialNumber = String(formData.get("serial") ?? "").trim();
  if (!serialNumber) return { error: "Numéro de série manquant." };
  if (!SERIAL_RE.test(serialNumber)) return { error: "Numéro de série invalide." };

  const routerIdRaw = String(formData.get("routerId") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim().slice(0, MAX_NOTE_LENGTH) || null;

  // Le blocage doit être réel : SN verrouillé par un AUTRE compte.
  const blocked = await isSerialLockedByAnotherOrg(serialNumber, session.orgId);
  if (!blocked) {
    return { error: "Ce numéro de série n'est pas (ou plus) bloqué pour votre compte." };
  }

  // Si un routeur est indiqué, il doit appartenir au demandeur.
  let routerId: string | null = null;
  let routerName: string | null = null;
  if (routerIdRaw) {
    const db = getDb();
    const [router] = await db
      .select({ id: routers.id, name: routers.name })
      .from(routers)
      .where(and(eq(routers.id, routerIdRaw), eq(routers.orgId, session.orgId)))
      .limit(1);
    if (router) {
      routerId = router.id;
      routerName = router.name;
    }
  }

  const request = await createSerialUnlockRequest({
    orgId: session.orgId,
    userId: session.userId,
    requesterEmail: session.email,
    requesterName: session.name,
    serialNumber,
    routerId,
    routerName,
    note,
  });

  const { whatsappNumber, adminEmail } = getManualPaymentContact();
  const lines = [
    "*Demande de déblocage MikroTik — SafeLinkHub*",
    `Numéro de série : ${serialNumber}`,
    `Utilisateur : ${session.name} (${session.email})`,
    routerName ? `Routeur : ${routerName}` : "Routeur : (non précisé)",
    note ? `Message : ${note}` : "Message : (aucun)",
    `Réf : ${request.id}`,
  ];
  const whatsappUrl = buildWhatsappLink(whatsappNumber, lines.join("\n"));
  const emailSent = await sendAdminEmail(adminEmail, serialNumber, lines).catch(() => false);

  revalidatePath("/admin/authorizations");
  return { success: true, requestId: request.id, whatsappUrl, emailSent };
}

async function sendAdminEmail(
  adminEmail: string | null,
  serialNumber: string,
  lines: string[],
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !adminEmail) return false;
  const from = process.env.RESEND_FROM || "SafeLinkHub <onboarding@resend.dev>";
  const resend = new Resend(apiKey);
  const html = `<h2>Nouvelle demande de déblocage MikroTik — série ${serialNumber}</h2><ul>${lines
    .slice(1)
    .map((l) => `<li>${l}</li>`)
    .join("")}</ul><p>Validez ou refusez depuis <strong>/admin/authorizations</strong>.</p>`;
  const { error } = await resend.emails.send({
    from,
    to: adminEmail,
    subject: `SafeLinkHub — Déblocage MikroTik (série ${serialNumber})`,
    html,
  });
  return !error;
}

/**
 * Valide (→ libère le verrou de série) ou refuse une demande de déblocage.
 * Superadmin uniquement.
 */
export async function decideSerialUnlock(
  id: string,
  decision: "approved" | "rejected",
  note?: string,
): Promise<{ success: true } | { error: string }> {
  const session = await getSession();
  if (!isSuperAdmin(session?.role)) return { error: "Réservé au superadmin." };
  const row = await decideSerialUnlockRequest(id, decision, session!.userId, note);
  if (!row) return { error: "Demande introuvable ou déjà traitée." };
  revalidatePath("/admin/authorizations");
  revalidatePath("/admin/settings/router-setup");
  return { success: true };
}

/** État de la dernière demande pour un SN (UI). */
export async function getSerialUnlockStatus(serial: string): Promise<{
  blocked: boolean;
  latestStatus: string | null;
}> {
  const session = await getSession();
  if (!session) return { blocked: false, latestStatus: null };
  const serialNumber = String(serial ?? "").trim();
  if (!serialNumber) return { blocked: false, latestStatus: null };
  const [blocked, latest] = await Promise.all([
    isSerialLockedByAnotherOrg(serialNumber, session.orgId),
    getLatestSerialUnlockRequest(serialNumber, session.orgId),
  ]);
  return { blocked, latestStatus: latest?.status ?? null };
}
