// Client HTTP bas niveau pour l'API Wassoya (SMS, WhatsApp, Email — wassoya.com).
// Purement transport : ne touche NI la base NI l'environnement pour les clés.
// L'appelant fournit la clé API (par-org, lue depuis `sms_gateways`, voir send.ts).
// Module serveur uniquement.
//
// Doc : https://wassoya.com/docs — auth `Authorization: Bearer <clé>`,
// POST /sms/messages { from, to, content }. Enveloppe de réponse :
// { "success": boolean, "error"?: string, "data"?: {...} }.

const DEFAULT_BASE_URL = "https://api.wassoya.com";

/** Base de l'API, surchargée par WASSOYA_BASE_URL (sans slash final). */
function baseUrl(): string {
  return (process.env.WASSOYA_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

export type SendSmsInput = {
  /** Clé API Wassoya en clair (déjà déchiffrée par l'appelant). */
  apiKey: string;
  /** Nom d'expéditeur (from). Tronqué à 11 caractères par Wassoya. */
  from: string | null;
  /** Numéro destinataire au format international (ex. 2250700000000). */
  to: string;
  /** Corps du message. */
  content: string;
  /** URL de callback optionnelle (statut de livraison). */
  notifyUrl?: string;
};

export type SendSmsResult =
  | { ok: true; messageId: string | null }
  | { ok: false; error: string };

/**
 * Normalise un numéro vers le format attendu par Wassoya : chiffres uniquement,
 * sans `+`, espaces ni séparateurs. On ne devine PAS l'indicatif pays ici —
 * l'appelant doit fournir un numéro déjà international.
 */
export function normalizeMsisdn(raw: string): string {
  return raw.replace(/[^\d]/g, "");
}

/** Envoie un SMS via Wassoya. N'émet jamais d'exception : renvoie un résultat. */
export async function sendWassoyaSms(input: SendSmsInput): Promise<SendSmsResult> {
  const to = normalizeMsisdn(input.to);
  if (!to) return { ok: false, error: "Numéro destinataire invalide." };
  if (!input.content.trim()) return { ok: false, error: "Message vide." };

  let res: Response;
  try {
    res = await fetch(`${baseUrl()}/sms/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: input.from || undefined,
        to,
        content: input.content,
        notifyUrl: input.notifyUrl,
      }),
      cache: "no-store",
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Échec de contact Wassoya." };
  }

  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;

  if (!res.ok || json?.success === false) {
    const msg =
      (json?.error as string) ||
      (json?.message as string) ||
      `Erreur Wassoya (${res.status}).`;
    return { ok: false, error: String(msg) };
  }

  const data = (json?.data ?? json) as Record<string, unknown> | null;
  const messageId = data?.messageId ?? data?.id ?? null;
  return { ok: true, messageId: messageId != null ? String(messageId) : null };
}
