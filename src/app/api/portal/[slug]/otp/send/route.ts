// Endpoint PUBLIC appelé par le portail captif : envoie un code OTP par SMS au
// numéro du client avant de l'autoriser à payer. Le préfixe pays vient de l'org
// (pays où opère le routeur) — le client ne saisit que son numéro local.
// Aucune session (c'est le client final). Runtime Node (crypto).
//
// Décisions produit : (1) une vérification réussie est mémorisée ~30 min → un
// numéro déjà vérifié renvoie {status:"verified"} sans re-SMS ; (2) SMS
// OBLIGATOIRE : une org sans passerelle Wassoya ne peut pas vendre au portail.

import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { organizations, portalOtps } from "@/lib/db/schema";
import { sendOrgSms } from "@/lib/sms/send";
import { corsJson, corsPreflight } from "@/lib/portal/cors";
import { getOrgDial } from "@/lib/portal/org-dial";
import {
  OTP_TTL_MS,
  OTP_VERIFY_TTL_MS,
  OTP_RESEND_COOLDOWN_MS,
  generateOtpCode,
  hashOtpCode,
  toInternational,
  maskPhone,
} from "@/lib/portal/otp";

export function OPTIONS() {
  return corsPreflight();
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return corsJson({ error: "Corps JSON invalide." }, { status: 400 });
  }

  const db = getDb();
  const [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, slug))
    .limit(1);
  if (!org) return corsJson({ error: "Organisation inconnue." }, { status: 404 });

  const { dialCode } = await getOrgDial(org.id);
  const phone = toInternational(String(body.phone ?? ""), dialCode);
  if (phone.length < 8) return corsJson({ error: "Numéro invalide." }, { status: 400 });

  const now = Date.now();
  const [existing] = await db
    .select()
    .from(portalOtps)
    .where(and(eq(portalOtps.orgId, org.id), eq(portalOtps.phone, phone)))
    .limit(1);

  // Déjà vérifié récemment : on ne renvoie pas de SMS (mémorisation ~30 min).
  if (existing?.verifiedAt && now - existing.verifiedAt.getTime() < OTP_VERIFY_TTL_MS) {
    return corsJson({ status: "verified" });
  }

  // Anti-spam : délai minimal entre deux envois pour un même numéro.
  if (existing && now - existing.lastSentAt.getTime() < OTP_RESEND_COOLDOWN_MS) {
    return corsJson(
      { error: "Patientez quelques secondes avant de redemander un code." },
      { status: 429 },
    );
  }

  const code = generateOtpCode();
  const codeHash = hashOtpCode(org.id, phone, code);
  const expiresAt = new Date(now + OTP_TTL_MS);

  // Une seule ligne OTP courante par (org, numéro) : l'envoi réécrit la ligne
  // et réinitialise essais + vérification.
  await db
    .insert(portalOtps)
    .values({ orgId: org.id, phone, codeHash, expiresAt, attempts: 0, verifiedAt: null, lastSentAt: new Date(now) })
    .onConflictDoUpdate({
      target: [portalOtps.orgId, portalOtps.phone],
      set: { codeHash, expiresAt, attempts: 0, verifiedAt: null, lastSentAt: new Date(now) },
    });

  const sms = await sendOrgSms({
    orgId: org.id,
    to: phone,
    content: `Code de verification WiFi : ${code} (valide 5 min). Ne le partagez pas.`,
  });

  if (!sms.ok) {
    // SMS obligatoire : sans passerelle configurée, la vente est bloquée.
    console.warn("[portal:otp] envoi SMS impossible", { slug, error: sms.error });
    return corsJson(
      { error: "Verification par SMS indisponible. Contactez le point de vente." },
      { status: 400 },
    );
  }

  return corsJson({ status: "sent", to: maskPhone(phone) });
}
