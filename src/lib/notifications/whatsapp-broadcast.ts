// Diffusion WhatsApp aux organisations (superadmin).
//
// Deux voies, le même contenu :
//   1. lien wa.me prêt à envoyer (clic → WhatsApp s'ouvre, l'opérateur envoie) ;
//   2. envoi automatique via l'API WhatsApp Cloud de Meta (si configurée).
//
// Aucun secret n'est codé en dur : l'API lit WHATSAPP_TOKEN, WHATSAPP_PHONE_ID
// et (pour un envoi « à froid ») WHATSAPP_TEMPLATE_NAME — un modèle APPROUVÉ par
// Meta est obligatoire hors fenêtre de 24 h. Sans ces variables, seule la voie
// wa.me (manuelle) fonctionne.
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { organizations, routers, users } from "@/lib/db/schema";
import { toInternationalDigits, type WhatsappRecipient } from "./whatsapp-shared";

// Les bouts purs (type, helpers sans BD) vivent dans whatsapp-shared.ts pour
// que le composant client puisse les importer sans tirer la BD. Réexportés ici
// par commodité pour les appelants serveur.
export { toInternationalDigits, waMeLink, defaultBroadcastMessage, type WhatsappRecipient } from "./whatsapp-shared";

/** Organisations ayant au moins un routeur MikHmon (mot de passe posé) + leur numéro. */
export async function getWhatsappRecipients(): Promise<WhatsappRecipient[]> {
  const db = getDb();
  const rows = await db
    .select({
      orgId: organizations.id,
      orgName: organizations.name,
      dialCode: sql<string | null>`(select phone_dial_code from users where org_id = ${organizations.id} order by created_at limit 1)`,
      whatsapp: sql<string | null>`(select whatsapp from users where org_id = ${organizations.id} order by created_at limit 1)`,
      phone: sql<string | null>`(select phone from users where org_id = ${organizations.id} order by created_at limit 1)`,
      mikhmonRouters: sql<number>`count(${routers.id})::int`,
    })
    .from(organizations)
    .innerJoin(
      routers,
      and(eq(routers.orgId, organizations.id), isNotNull(routers.mikhmonAdminPasswordEncrypted)),
    )
    .groupBy(organizations.id, organizations.name)
    .orderBy(organizations.name);

  void users; // référencé par les sous-requêtes SQL ci-dessus.
  return rows.map((r) => {
    const number = r.whatsapp ?? r.phone ?? null;
    return {
      orgId: r.orgId,
      orgName: r.orgName,
      digits: toInternationalDigits(number, r.dialCode),
      display: number ? `${r.dialCode ? r.dialCode + " " : ""}${number}` : null,
      mikhmonRouters: r.mikhmonRouters,
    };
  });
}

export type WhatsappSendResult = { ok: boolean; error?: string; configured: boolean };

/** Envoi via l'API WhatsApp Cloud (Meta). Modèle approuvé requis pour un envoi à froid. */
export async function sendWhatsappCloud(digits: string, message: string): Promise<WhatsappSendResult> {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  const template = process.env.WHATSAPP_TEMPLATE_NAME;
  const lang = process.env.WHATSAPP_TEMPLATE_LANG || "fr";
  if (!token || !phoneId) {
    return { ok: false, configured: false, error: "WHATSAPP_TOKEN / WHATSAPP_PHONE_ID absents." };
  }
  // Avec modèle approuvé : notification à froid. Sinon texte (fenêtre 24 h only).
  const body = template
    ? {
        messaging_product: "whatsapp",
        to: digits,
        type: "template",
        template: {
          name: template,
          language: { code: lang },
          components: [{ type: "body", parameters: [{ type: "text", text: message }] }],
        },
      }
    : { messaging_product: "whatsapp", to: digits, type: "text", text: { body: message } };
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      return { ok: false, configured: true, error: data.error?.message ?? `HTTP ${res.status}` };
    }
    return { ok: true, configured: true };
  } catch (err) {
    return { ok: false, configured: true, error: err instanceof Error ? err.message : "Envoi impossible." };
  }
}
