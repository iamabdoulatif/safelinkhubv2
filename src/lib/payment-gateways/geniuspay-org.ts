// Client GeniusPay au niveau ORG (clés propres à chaque org, table
// payment_gateways) — utilisé par le PORTAIL CAPTIF : le client final paie son
// forfait WiFi sur le compte GeniusPay de l'org, l'argent va directement chez
// elle (voir [[geniuspay-vouchers-integration]]). À ne PAS confondre avec
// lib/payment-gateways/geniuspay.ts qui lit les clés PLATEFORME dans l'env.
// Module serveur uniquement.
//
// Doc : https://pay.genius.ci/doc — auth par en-têtes X-API-Key / X-API-Secret,
// POST /payments → checkout_url, GET /payments/{reference} → { status }.

import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { paymentGateways } from "@/lib/db/schema";
import { decryptSecret } from "@/lib/mikrotik/crypto";

const DEFAULT_BASE_URL = "https://pay.genius.ci/api/v1/merchant";

function baseUrl(): string {
  return (process.env.GENIUSPAY_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

export type OrgGeniusCreds = {
  apiKey: string; // X-API-Key  (merchantId, pk_live_…)
  apiSecret: string; // X-API-Secret (déchiffré, sk_live_…)
};

/** Charge et déchiffre les clés genius_pay ACTIVÉES d'une org, ou null. */
export async function getOrgGeniusCreds(orgId: string): Promise<OrgGeniusCreds | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(paymentGateways)
    .where(
      and(
        eq(paymentGateways.orgId, orgId),
        eq(paymentGateways.provider, "genius_pay"),
        eq(paymentGateways.enabled, true),
      ),
    )
    .limit(1);
  if (!row || !row.merchantId || !row.apiKeyEncrypted) return null;
  try {
    return { apiKey: row.merchantId, apiSecret: decryptSecret(row.apiKeyEncrypted) };
  } catch {
    return null;
  }
}

function headers(creds: OrgGeniusCreds): Record<string, string> {
  return {
    "X-API-Key": creds.apiKey,
    "X-API-Secret": creds.apiSecret,
    "Content-Type": "application/json",
  };
}

export type CreateOrgPaymentInput = {
  amountFcfa: number;
  description: string;
  customer?: { name?: string; phone?: string };
  metadata?: Record<string, unknown>;
  successUrl?: string;
  errorUrl?: string;
};

export type CreateOrgPaymentResult =
  | { ok: true; reference: string; paymentUrl: string }
  | { ok: false; error: string };

/** Crée une transaction sur le compte GeniusPay de l'org, renvoie le checkout. */
export async function createOrgPayment(
  creds: OrgGeniusCreds,
  input: CreateOrgPaymentInput,
): Promise<CreateOrgPaymentResult> {
  if (!Number.isInteger(input.amountFcfa) || input.amountFcfa < 100) {
    return { ok: false, error: "Montant invalide (minimum 100 FCFA)." };
  }
  let res: Response;
  try {
    res = await fetch(`${baseUrl()}/payments`, {
      method: "POST",
      headers: headers(creds),
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
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Échec de contact GeniusPay." };
  }

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
  // reference, checkout_url, payment_url, … } }. On lit `data` en priorité,
  // avec repli au niveau racine par robustesse.
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
}

// ── Enregistrement automatique du webhook (par-org) ────────────────────────
// GeniusPay n'accepte PAS d'URL de callback dans la création de paiement : les
// webhooks sont configurés au niveau du COMPTE (POST /webhooks, doc
// pay.genius.ci). Comme le portail captif encaisse sur le compte GeniusPay de
// CHAQUE org, on enregistre nous-mêmes le webhook dans le compte de l'org pour
// que la notification arrive « sur tous les portails par défaut », sans config
// manuelle. Le endpoint /api/payments/geniuspay/webhook ré-vérifie chaque
// notification via les clés de l'org : on n'a donc PAS besoin du secret
// whsec_… renvoyé à la création (aucun secret partagé pour le flux portail).

const WEBHOOK_NAME = "safelinkhub-webhook";

/** URL publique de notre endpoint webhook (identique pour toutes les orgs). */
function webhookUrl(): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || "https://safelinkhub.io").replace(/\/+$/, "");
  return `${base}/api/payments/geniuspay/webhook`;
}

// Orgs dont le webhook a déjà été confirmé pendant la vie de ce process : évite
// de re-lister/créer à chaque paiement. Vidé au cold start (re-vérifie une fois).
const ensuredOrgs = new Set<string>();

/** Oublie l'org du cache (à appeler quand ses clés GeniusPay changent). */
export function forgetOrgWebhook(orgId: string): void {
  ensuredOrgs.delete(orgId);
}

/**
 * Garantit que le compte GeniusPay de l'org possède un webhook pointant vers
 * notre endpoint (événements payment.success / payment.failed). Idempotent
 * (vérifie l'existant avant de créer) et best-effort : ne lève jamais et
 * n'échoue jamais un paiement — le portail retombe de toute façon sur le
 * polling si le webhook n'est pas enregistré.
 */
export async function ensureOrgWebhook(
  creds: OrgGeniusCreds,
  orgId: string,
  opts?: { force?: boolean },
): Promise<void> {
  if (!opts?.force && ensuredOrgs.has(orgId)) return;
  const url = webhookUrl();
  try {
    // Déjà présent ? (idempotence — pas de doublon à chaque re-save.)
    const listRes = await fetch(`${baseUrl()}/webhooks`, {
      method: "GET",
      headers: headers(creds),
      cache: "no-store",
    });
    if (listRes.ok) {
      const listJson = (await listRes.json().catch(() => null)) as unknown;
      const raw = listJson as Record<string, unknown> | null;
      const items: unknown[] = Array.isArray(listJson)
        ? listJson
        : Array.isArray(raw?.data)
          ? (raw!.data as unknown[])
          : Array.isArray(raw?.webhooks)
            ? (raw!.webhooks as unknown[])
            : [];
      if (items.some((w) => (w as Record<string, unknown>)?.url === url)) {
        ensuredOrgs.add(orgId);
        return;
      }
    }

    const createRes = await fetch(`${baseUrl()}/webhooks`, {
      method: "POST",
      headers: headers(creds),
      body: JSON.stringify({
        name: WEBHOOK_NAME,
        url,
        events: ["payment.success", "payment.failed"],
      }),
      cache: "no-store",
    });
    if (createRes.ok) {
      ensuredOrgs.add(orgId);
      console.info("[geniuspay:webhook] enregistré sur le compte de l'org", { orgId });
    } else {
      const msg = await createRes.text().catch(() => "");
      console.warn("[geniuspay:webhook] enregistrement refusé", {
        orgId,
        status: createRes.status,
        msg: msg.slice(0, 200),
      });
    }
  } catch (e) {
    console.warn("[geniuspay:webhook] enregistrement impossible", { orgId, error: String(e) });
  }
}

export type OrgPaymentStatus = "pending" | "completed" | "failed" | "unknown";

/**
 * Lit le statut d'une transaction. Mappe les valeurs GeniusPay
 * (pending/processing/completed/failed/cancelled/refunded/expired) vers un
 * ensemble réduit exploitable par le portail.
 */
export async function getOrgPaymentStatus(
  creds: OrgGeniusCreds,
  reference: string,
): Promise<{ ok: true; status: OrgPaymentStatus } | { ok: false; error: string }> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl()}/payments/${encodeURIComponent(reference)}`, {
      method: "GET",
      headers: headers(creds),
      cache: "no-store",
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Échec de contact GeniusPay." };
  }
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) {
    return { ok: false, error: `Erreur GeniusPay (${res.status}).` };
  }
  const raw = String(
    (json?.status as string) ||
      ((json?.data as Record<string, unknown>)?.status as string) ||
      "",
  ).toLowerCase();

  let status: OrgPaymentStatus = "unknown";
  if (raw === "completed" || raw === "success") status = "completed";
  else if (raw === "pending" || raw === "processing") status = "pending";
  else if (raw === "failed" || raw === "cancelled" || raw === "refunded" || raw === "expired")
    status = "failed";

  return { ok: true, status };
}
