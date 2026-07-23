// Envoi de SMS au niveau d'une org : résout la passerelle configurée dans
// `sms_gateways`, déchiffre la clé API, puis délègue au transport Wassoya.
// C'est ce point d'entrée qu'appelleront les flux produit (ex. code de
// connexion auto-login par MAC). Module serveur uniquement.

import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { smsGateways } from "@/lib/db/schema";
import { decryptSecret } from "@/lib/mikrotik/crypto";
import { sendWassoyaSms, type SendSmsResult } from "./wassoya";

// `notConfigured` distingue « l'org n'a pas de passerelle SMS utilisable »
// (config absente → vente au portail bloquée, décision produit) d'un échec
// d'ENVOI sur une passerelle configurée (solde épuisé, API en panne) — cas où
// le portail bascule en repli « code affiché à l'écran » au lieu de bloquer.
export type OrgSmsResult = SendSmsResult & { notConfigured?: boolean };

/**
 * Envoie un SMS pour le compte d'une org.
 * Renvoie `{ ok: false }` (sans lever d'exception) si aucune passerelle
 * n'est activée ou si la clé manque — l'appelant décide de la gravité.
 */
export async function sendOrgSms(params: {
  orgId: string;
  to: string;
  content: string;
  notifyUrl?: string;
}): Promise<OrgSmsResult> {
  const db = getDb();
  const [gateway] = await db
    .select()
    .from(smsGateways)
    .where(
      and(
        eq(smsGateways.orgId, params.orgId),
        eq(smsGateways.provider, "wassoya"),
        eq(smsGateways.enabled, true),
      ),
    )
    .limit(1);

  if (!gateway) {
    return { ok: false, error: "Aucune passerelle SMS activée.", notConfigured: true };
  }
  if (!gateway.apiKeyEncrypted) {
    return { ok: false, error: "Clé API SMS manquante.", notConfigured: true };
  }

  let apiKey: string;
  try {
    apiKey = decryptSecret(gateway.apiKeyEncrypted);
  } catch {
    return { ok: false, error: "Impossible de déchiffrer la clé API SMS.", notConfigured: true };
  }

  return sendWassoyaSms({
    apiKey,
    from: gateway.senderId,
    to: params.to,
    content: params.content,
    notifyUrl: params.notifyUrl,
  });
}
