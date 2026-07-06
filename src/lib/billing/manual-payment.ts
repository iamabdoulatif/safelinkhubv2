// TEMPORAIRE — helpers partagés par les portes de monétisation manuelle
// (Auto-Setup et Accès distant) : contact admin, upload de la preuve de
// paiement (Vercel Blob) et email d'autorisation (Resend). Module serveur
// (importé uniquement par des server actions).
// TODO: Remplacer par système de paiement intégré.

import { put } from "@vercel/blob";
import { Resend } from "resend";

export const MAX_PROOF_BYTES = 5 * 1024 * 1024; // 5 Mo

/**
 * Contact admin partagé (numéro WhatsApp + email destinataire). Une seule
 * config pour les deux portes ; retombe sur les variables AUTO_SETUP_* déjà
 * en place, puis sur le numéro par défaut.
 */
export function getManualPaymentContact(): { whatsappNumber: string; adminEmail: string | null } {
  const whatsappNumber = (
    process.env.MANUAL_AUTH_WHATSAPP_NUMBER ||
    process.env.AUTO_SETUP_WHATSAPP_NUMBER ||
    "2250709100552"
  ).replace(/[^0-9]/g, "");
  const adminEmail =
    process.env.MANUAL_AUTH_ADMIN_EMAIL || process.env.AUTO_SETUP_ADMIN_EMAIL || null;
  return { whatsappNumber, adminEmail };
}

/**
 * Téléverse la preuve de paiement. Renvoie l'URL, ou null si le fichier est
 * absent/invalide ou si le stockage n'est pas configuré (on ne bloque jamais
 * la demande : la preuve part aussi par WhatsApp).
 */
export async function uploadPaymentProof(
  proof: FormDataEntryValue | null,
  keyPrefix: string,
): Promise<{ url: string | null; tooLarge: boolean }> {
  if (!(proof instanceof File) || proof.size === 0) return { url: null, tooLarge: false };
  if (proof.size > MAX_PROOF_BYTES) return { url: null, tooLarge: true };
  try {
    const ext = proof.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
    const blob = await put(`${keyPrefix}-${Date.now()}.${ext}`, proof, {
      access: "public",
      addRandomSuffix: true,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    return { url: blob.url, tooLarge: false };
  } catch {
    return { url: null, tooLarge: false };
  }
}

/** Envoie l'email d'autorisation à l'admin (best-effort). */
export async function sendManualAuthEmail(
  adminEmail: string | null,
  subject: string,
  lines: string[],
  proofUrl: string | null,
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !adminEmail) return false;
  const from = process.env.RESEND_FROM || "SafeLinkHub <onboarding@resend.dev>";
  const resend = new Resend(apiKey);
  const html = `<h2>${subject}</h2><ul>${lines
    .map((l) => `<li>${l}</li>`)
    .join("")}</ul>${proofUrl ? `<p><a href="${proofUrl}">Voir la preuve de paiement</a></p>` : ""}`;
  const { error } = await resend.emails.send({ from, to: adminEmail, subject, html });
  return !error;
}
