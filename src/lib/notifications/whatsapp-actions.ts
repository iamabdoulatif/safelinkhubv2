"use server";

import { getSession, isSuperAdmin } from "@/lib/auth/session";
import {
  getWhatsappRecipients,
  sendWhatsappCloud,
  type WhatsappRecipient,
} from "./whatsapp-broadcast";

export async function loadWhatsappBroadcast(): Promise<
  { error: string } | { recipients: WhatsappRecipient[]; apiConfigured: boolean }
> {
  const session = await getSession();
  if (!session || !isSuperAdmin(session.role)) return { error: "Réservé au superadmin." };
  const recipients = await getWhatsappRecipients();
  const apiConfigured = Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID);
  return { recipients, apiConfigured };
}

/** Envoi automatique à TOUTES les organisations ayant un numéro, via l'API Cloud. */
export async function sendWhatsappBroadcastApi(
  message: string,
): Promise<
  | { error: string }
  | { configured: boolean; sent: string[]; failed: { org: string; error: string }[]; skipped: string[] }
> {
  const session = await getSession();
  if (!session || !isSuperAdmin(session.role)) return { error: "Réservé au superadmin." };
  const text = message.trim();
  if (!text) return { error: "Message vide." };

  const recipients = await getWhatsappRecipients();
  const sent: string[] = [];
  const failed: { org: string; error: string }[] = [];
  const skipped: string[] = [];
  let configured = true;

  for (const r of recipients) {
    if (!r.digits) {
      skipped.push(r.orgName);
      continue;
    }
    const msg = text.replace(/\{org\}/g, r.orgName);
    const res = await sendWhatsappCloud(r.digits, msg);
    if (!res.configured) {
      configured = false;
      break; // inutile de continuer si l'API n'est pas configurée
    }
    if (res.ok) sent.push(r.orgName);
    else failed.push({ org: r.orgName, error: res.error ?? "échec" });
  }
  return { configured, sent, failed, skipped };
}
