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
// (décochée dans les réglages, ou clé absente) d'un échec d'ENVOI sur une
// passerelle activée (crédit épuisé, API en panne). AUCUN des deux ne bloque
// la vente au portail : les deux font sauter la vérification et affichent le
// code à l'écran. La distinction sert à ne pas inscrire « échec » ni
// programmer de reprise là où il n'y a rien à réessayer.
export type OrgSmsResult = SendSmsResult & { notConfigured?: boolean };

/**
 * La passerelle SMS de l'org est-elle ACTIVÉE et utilisable ?
 *
 * Sert aux chemins qui doivent se comporter différemment quand l'opérateur a
 * volontairement décoché la passerelle : ne pas ouvrir de tentative d'envoi,
 * ne pas programmer de reprise, ne rien inscrire comme « échec » — il n'y a
 * rien qui a échoué, l'envoi n'a simplement pas lieu d'être.
 */
export async function isOrgSmsEnabled(orgId: string): Promise<boolean> {
  const db = getDb();
  const [gateway] = await db
    .select({ apiKeyEncrypted: smsGateways.apiKeyEncrypted })
    .from(smsGateways)
    .where(
      and(
        eq(smsGateways.orgId, orgId),
        eq(smsGateways.provider, "wassoya"),
        eq(smsGateways.enabled, true),
      ),
    )
    .limit(1);
  return Boolean(gateway?.apiKeyEncrypted);
}

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
