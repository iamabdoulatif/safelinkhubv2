// Client GeniusPay au niveau PLATEFORME (compte unique de SafeLinkHub) —
// utilisé pour encaisser ce que l'org paie à la plateforme (accès distant VPN).
// Ce n'est PAS le modèle par-org de `payment_gateways` (ventes WiFi au portail
// captif, qui restent sur le propre compte GeniusPay de chaque org). Ici les
// clés sont lues depuis l'environnement, jamais depuis la base.
//
// Doc : https://pay.genius.ci/doc — auth par en-têtes X-API-Key / X-API-Secret,
// POST /payments renvoie un checkout_url, webhooks signés en HMAC-SHA256.
// Module serveur uniquement (crypto Node) : ne jamais l'importer côté client.

import { createHmac, timingSafeEqual } from "node:crypto";

const DEFAULT_BASE_URL = "https://pay.genius.ci/api/v1/merchant";

type GeniusPayConfig = {
  apiKey: string;
  apiSecret: string;
  webhookSecret: string | null;
  baseUrl: string;
};

/** Lit la config plateforme depuis l'environnement, ou null si les clés manquent. */
export function getGeniusPayConfig(): GeniusPayConfig | null {
  const apiKey = process.env.GENIUSPAY_API_KEY;
  const apiSecret = process.env.GENIUSPAY_API_SECRET;
  if (!apiKey || !apiSecret) return null;
  return {
    apiKey,
    apiSecret,
    webhookSecret: process.env.GENIUSPAY_WEBHOOK_SECRET || null,
    baseUrl: (process.env.GENIUSPAY_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, ""),
  };
}

export function isGeniusPayConfigured(): boolean {
  return getGeniusPayConfig() !== null;
}

/**
 * Le checkout GeniusPay est-il VISIBLE (boutons "Payer en ligne") ?
 * ACTIVÉ PAR DÉFAUT dès que les clés plateforme sont configurées : le paiement
 * en ligne (auto-setup 15 000, services VPN) est désormais la voie normale de
 * facturation. On peut le désactiver explicitement avec GENIUSPAY_CHECKOUT_ENABLED=0
 * (ou false/off). Auparavant off-par-défaut (feature-flag de rollout) — mais ce
 * défaut faisait perdre la facturation au moindre déploiement qui ne portait pas
 * la var d'env ; on inverse donc le défaut pour la rendre robuste.
 */
export function isGeniusPayCheckoutEnabled(): boolean {
  if (!isGeniusPayConfigured()) return false;
  const flag = (process.env.GENIUSPAY_CHECKOUT_ENABLED || "").toLowerCase();
  return flag !== "0" && flag !== "false" && flag !== "off";
}

export type CreatePaymentInput = {
  /** Montant en FCFA (entier). Minimum GeniusPay : 100. */
  amountFcfa: number;
  description: string;
  customer?: { name?: string; email?: string; phone?: string; country?: string };
  /** Métadonnées renvoyées telles quelles dans les réponses et webhooks. */
  metadata?: Record<string, unknown>;
  successUrl?: string;
  errorUrl?: string;
};

export type CreatePaymentResult =
  | { ok: true; reference: string; paymentUrl: string }
  | { ok: false; error: string };

/**
 * Crée une transaction GeniusPay et renvoie le lien de checkout hébergé.
 * On omet volontairement `payment_method` : GeniusPay affiche alors sa page
 * de checkout où l'org choisit son rail (Wave en tête). Le montant est
 * imposé côté serveur par l'appelant — jamais fourni par le client.
 */
export async function createGeniusPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
  const config = getGeniusPayConfig();
  if (!config) return { ok: false, error: "GeniusPay non configuré (clés API manquantes)." };
  if (!Number.isInteger(input.amountFcfa) || input.amountFcfa < 100) {
    return { ok: false, error: "Montant invalide (minimum 100 FCFA)." };
  }

  try {
    const res = await fetch(`${config.baseUrl}/payments`, {
      method: "POST",
      headers: {
        "X-API-Key": config.apiKey,
        "X-API-Secret": config.apiSecret,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: input.amountFcfa,
        currency: "XOF",
        description: input.description.slice(0, 500),
        customer: input.customer,
        metadata: input.metadata,
        success_url: input.successUrl,
        error_url: input.errorUrl,
      }),
      cache: "no-store",
    });

    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!res.ok) {
      const msg =
        (json?.detail as string) ||
        (json?.error as string) ||
        (json?.message as string) ||
        `Erreur GeniusPay (${res.status}).`;
      return { ok: false, error: String(msg) };
    }

    // GeniusPay enveloppe la charge utile dans `data` : { success, data: {
    // reference, checkout_url, payment_url, … } }. Lire `data` en priorité,
    // repli racine par robustesse (même correctif que geniuspay-org.ts).
    const data = (json?.data as Record<string, unknown>) ?? json ?? {};
    const reference = data.reference ?? json?.reference;
    const paymentUrl =
      (data.payment_url as string) ||
      (data.checkout_url as string) ||
      (json?.payment_url as string) ||
      (json?.checkout_url as string);
    if (!reference || !paymentUrl) {
      return { ok: false, error: "Réponse GeniusPay incomplète (pas de lien de paiement)." };
    }
    return { ok: true, reference: String(reference), paymentUrl: String(paymentUrl) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Échec de contact GeniusPay." };
  }
}

/**
 * Vérifie la signature d'un webhook GeniusPay.
 * signature = HMAC-SHA256(timestamp + "." + corps_brut, webhookSecret), en hex.
 * Le corps DOIT être la chaîne brute reçue (pas un JSON re-sérialisé).
 */
export function verifyGeniusWebhookSignature(params: {
  rawBody: string;
  signature: string | null;
  timestamp: string | null;
}): boolean {
  const config = getGeniusPayConfig();
  if (!config?.webhookSecret) return false;
  const { rawBody, signature, timestamp } = params;
  if (!signature || !timestamp) return false;

  const expected = createHmac("sha256", config.webhookSecret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
