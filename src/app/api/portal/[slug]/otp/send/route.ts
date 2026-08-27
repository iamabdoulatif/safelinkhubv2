// Endpoint PUBLIC appelé par le portail captif : envoie un code OTP par SMS au
// numéro du client avant de l'autoriser à payer. Le préfixe pays vient de l'org
// (pays où opère le routeur) — le client ne saisit que son numéro local.
// Aucune session (c'est le client final). Runtime Node (crypto).
//
// Décisions produit : (1) une vérification réussie est mémorisée SANS limite de
// durée → un numéro déjà vérifié une fois renvoie {status:"verified"} sans
// re-SMS, quel que soit l'ancienneté (seul un NOUVEAU numéro reçoit un code) ;
// (2) une org sans passerelle Wassoya CONFIGURÉE ne peut pas vendre au portail,
// mais un échec d'ENVOI (solde épuisé…) bascule en repli code-à-l'écran.

import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { organizations, portalOtps } from "@/lib/db/schema";
import { sendOrgSms } from "@/lib/sms/send";
import { corsJson, corsPreflight } from "@/lib/portal/cors";
import { getOrgDial } from "@/lib/portal/org-dial";
import {
  OTP_TTL_MS,
  OTP_RESEND_COOLDOWN_MS,
  generateOtpCode,
  hashOtpCode,
  sanitizeClientDial,
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

  // Le portail envoie l'indicatif choisi par le client (sélecteur de pays) ;
  // repli sur celui de l'org pour les portails non ré-uploadés.
  const { dialCode: orgDial } = await getOrgDial(org.id);
  const dialCode = sanitizeClientDial(body.dialCode, orgDial);
  const phone = toInternational(String(body.phone ?? ""), dialCode);
  if (phone.length < 8) return corsJson({ error: "Numéro invalide." }, { status: 400 });

  const now = Date.now();
  const [existing] = await db
    .select()
    .from(portalOtps)
    .where(and(eq(portalOtps.orgId, org.id), eq(portalOtps.phone, phone)))
    .limit(1);

  // Numéro déjà vérifié une fois (mémorisation permanente par org + numéro) :
  // aucun re-SMS de code — le client va droit au paiement, seul le SMS du
  // ticket partira. Un NOUVEAU numéro, lui, passe par le code.
  if (existing?.verifiedAt) {
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
    content: `Code de verification SafeLinkHub : ${code} (valide 5 min). Ne le partagez pas.`,
  });

  if (!sms.ok) {
    console.warn("[portal:otp] envoi SMS impossible", { slug, error: sms.error });
    // Passerelle absente/inutilisable : la vente reste bloquée (décision produit
    // — une org sans SMS configuré ne vend pas au portail).
    if (sms.notConfigured) {
      return corsJson(
        { error: "Verification par SMS indisponible. Contactez le point de vente." },
        { status: 400 },
      );
    }
    // Passerelle configurée mais envoi refusé (solde SMS épuisé, API en panne) :
    // on ne bloque PAS la vente. Le numéro est marqué vérifié (la vérification
    // par SMS est de toute façon impossible) → /initiate acceptera le paiement,
    // et le code s'affichera à l'écran après paiement (repli du portail).
    await db
      .update(portalOtps)
      .set({ verifiedAt: new Date(now) })
      .where(and(eq(portalOtps.orgId, org.id), eq(portalOtps.phone, phone)));
    return corsJson({ status: "sms_unavailable" });
  }

  return corsJson({ status: "sent", to: maskPhone(phone) });
}
