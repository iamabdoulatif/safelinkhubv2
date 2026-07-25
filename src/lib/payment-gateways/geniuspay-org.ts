// Client GeniusPay au niveau ORG (clés propres à chaque org, table
// payment_gateways) — utilisé par le PORTAIL CAPTIF : le client final paie son
// forfait WiFi sur le compte GeniusPay de l'org, l'argent va directement chez
// elle (voir [[geniuspay-vouchers-integration]]). À ne PAS confondre avec
// lib/payment-gateways/geniuspay.ts qui lit les clés PLATEFORME dans l'env.
// Module serveur uniquement.
//
// Doc v3 : https://geniuspay.ci/docs/api — auth par en-têtes X-API-Key /
// X-API-Secret, POST /payments → checkout_url, GET /payments/{reference} →
// { status }, GET /pawapay/providers?country=XX → opérateurs mobile money.

import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { paymentGateways } from "@/lib/db/schema";
import { decryptSecret } from "@/lib/mikrotik/crypto";
import { formatGeniusPayCustomer, type GeniusPayCustomer } from "./phone";

// Plateforme GeniusPay v3 (geniuspay.ci). L'ancien host pay.genius.ci routait
// TOUT rail forcé sauf wave vers un Paystack cassé ; sur geniuspay.ci les rails
// mobile money passent par PawaPay (payment_method=pawapay + mmo_provider) et
// aboutissent correctement — vérifié le 2026-07-23 avec les clés réelles.
// Surchargeable par GENIUSPAY_BASE_URL. Mêmes clés X-API-Key/X-API-Secret.
const DEFAULT_BASE_URL = "https://geniuspay.ci/api/v1/merchant";

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
    // Impératif : GeniusPay tourne sous Laravel/LiteSpeed et fait de la
    // négociation de contenu — sans cet en-tête il peut renvoyer sa page SPA
    // (HTML) au lieu du JSON de l'API. Cf. le retry dans createOrgPayment.
    Accept: "application/json",
  };
}

function safeParse(s: string): Record<string, unknown> | null {
  try {
    return JSON.parse(s) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Message lisible d'une erreur GeniusPay. En v3, `error`/`detail` peuvent être
 * un OBJET `{code, message}` (ex. « PawaPay: Missing required field: phone_number »)
 * — `String(objet)` donnait alors « [object Object] » dans l'UI. On déballe donc
 * le `.message` de l'objet avant de retomber sur un message générique.
 */
function geniusErrorMessage(json: Record<string, unknown> | null, status: number): string {
  const cand = json?.error ?? json?.detail ?? json?.message;
  if (typeof cand === "string" && cand.trim()) return cand;
  if (cand && typeof cand === "object") {
    const obj = cand as Record<string, unknown>;
    const m = obj.message ?? obj.detail ?? obj.error;
    if (typeof m === "string" && m.trim()) return m;
  }
  if (typeof json?.message === "string" && json.message.trim()) return json.message;
  return `Erreur GeniusPay (${status}).`;
}

export type CreateOrgPaymentInput = {
  amountFcfa: number;
  description: string;
  customer?: GeniusPayCustomer;
  metadata?: Record<string, unknown>;
  successUrl?: string;
  errorUrl?: string;
  // Rail de paiement forcé. Valeurs GeniusPay v3 : "wave" (direct pay.wave.com)
  // | "pawapay" (Orange/MTN mobile money via l'agrégateur PawaPay, exige
  // mmoProvider) | "card". OMIS ⇒ page checkout hébergée geniuspay.ci qui liste
  // tous les moyens. Pour le portail captif on force wave ou pawapay (rails qui
  // aboutissent) ; les cas indisponibles retombent sur le checkout hébergé.
  paymentMethod?: string;
  // Code opérateur PawaPay quand paymentMethod="pawapay" (ex. "ORANGE_CIV",
  // "MTN_MOMO_CIV") — dépend du pays, cf. listPawapayProviders().
  mmoProvider?: string;
};

export type PawapayProvider = { code: string; name: string; type: string };

/**
 * Opérateurs mobile money PawaPay disponibles pour un pays (ISO2, ex. "CI").
 * Sert à router un choix Orange/MTN vers le bon `mmo_provider`. Renvoie []
 * en cas d'échec (l'appelant retombe alors sur le checkout hébergé).
 */
export async function listPawapayProviders(
  creds: OrgGeniusCreds,
  countryIso2: string,
): Promise<PawapayProvider[]> {
  const iso2 = countryIso2.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(iso2)) return [];
  try {
    const res = await fetch(`${baseUrl()}/pawapay/providers?country=${iso2}`, {
      method: "GET",
      headers: headers(creds),
      cache: "no-store",
    });
    if (!res.ok) return [];
    const json = safeParse(await res.text());
    const data = (json?.data as Record<string, unknown>) ?? {};
    const providers = data.providers;
    if (!Array.isArray(providers)) return [];
    return providers
      .filter((p): p is PawapayProvider => Boolean(p && typeof (p as PawapayProvider).code === "string"))
      .map((p) => ({ code: p.code, name: p.name ?? "", type: p.type ?? "" }));
  } catch {
    return [];
  }
}

/**
 * Code PawaPay correspondant à un opérateur ("orange" | "mtn") parmi les
 * providers d'un pays, ou undefined si indisponible (→ checkout hébergé).
 */
export function pickPawapayProvider(
  providers: PawapayProvider[],
  operator: "orange" | "mtn" | "moov",
): string | undefined {
  const kw = operator === "mtn" ? "MTN" : operator === "moov" ? "MOOV" : "ORANGE";
  return providers.find((p) => p.code.toUpperCase().includes(kw))?.code;
}

export type CreateOrgPaymentResult =
  | { ok: true; reference: string; paymentUrl: string }
  | { ok: false; error: string };

/** Crée une transaction sur le compte GeniusPay de l'org, renvoie le checkout. */
export async function createOrgPayment(
  creds: OrgGeniusCreds,
  input: CreateOrgPaymentInput,
): Promise<CreateOrgPaymentResult> {
  // GeniusPay refuse (422) tout montant XOF < 200 (« Le montant minimum pour
  // XOF est 200 ») — constaté le 2026-07-23, c'était 100 auparavant.
  if (!Number.isInteger(input.amountFcfa) || input.amountFcfa < 200) {
    return { ok: false, error: "Montant invalide (minimum 200 FCFA)." };
  }
  const body = JSON.stringify({
    amount: input.amountFcfa,
    currency: "XOF",
    description: input.description.slice(0, 500),
    customer: formatGeniusPayCustomer(input.customer),
    metadata: input.metadata,
    success_url: input.successUrl,
    error_url: input.errorUrl,
    ...(input.paymentMethod ? { payment_method: input.paymentMethod } : {}),
    ...(input.mmoProvider ? { mmo_provider: input.mmoProvider } : {}),
  });

  // GeniusPay (Laravel/LiteSpeed) renvoie PAR INTERMITTENCE sa page d'accueil SPA
  // (HTML 200) au lieu du JSON de l'API → sans retry, ça cassait la création de
  // paiement (symptôme « Wave ne redirige pas », aucune URL de checkout). Une
  // réponse HTML = requête NON traitée côté GeniusPay (aucune transaction créée),
  // donc rejouer ne crée PAS de doublon de charge. On réessaie uniquement les cas
  // transitoires (réseau, réponse non-JSON, JSON sans lien) ; une VRAIE erreur
  // JSON (ex. 422 validation) est déterministe → on la renvoie sans réessayer.
  const MAX_ATTEMPTS = 3;
  let lastError = "Réponse GeniusPay incomplète (pas de lien de paiement).";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (attempt > 1) await new Promise((r) => setTimeout(r, 250 * (attempt - 1)));
    let res: Response;
    try {
      res = await fetch(`${baseUrl()}/payments`, {
        method: "POST",
        headers: headers(creds),
        body,
        cache: "no-store",
      });
    } catch (e) {
      lastError = e instanceof Error ? e.message : "Échec de contact GeniusPay.";
      continue; // réseau : transitoire → réessai
    }

    const ct = res.headers.get("content-type") || "";
    const raw = await res.text().catch(() => "");
    const json = ct.includes("json") ? safeParse(raw) : null;

    if (!json) {
      // Réponse non-JSON (page SPA HTML de GeniusPay) → transitoire → réessai.
      lastError = `Réponse GeniusPay non-JSON (${res.status}).`;
      continue;
    }
    if (!res.ok) {
      // Erreur JSON déterministe → inutile de réessayer.
      return { ok: false, error: geniusErrorMessage(json, res.status) };
    }
    // GeniusPay enveloppe la charge utile dans `data` : { success, data: {
    // reference, checkout_url, payment_url, … } }. On lit `data` en priorité,
    // avec repli au niveau racine par robustesse.
    const data = (json.data as Record<string, unknown>) ?? json;
    const reference = data.reference ?? json.reference;
    const paymentUrl =
      (data.payment_url as string) ||
      (data.checkout_url as string) ||
      (json.payment_url as string) ||
      (json.checkout_url as string);
    if (reference && paymentUrl) {
      return { ok: true, reference: String(reference), paymentUrl: String(paymentUrl) };
    }
    lastError = "Réponse GeniusPay incomplète (pas de lien de paiement).";
  }
  return { ok: false, error: lastError };
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
  // GeniusPay (Laravel/LiteSpeed) renvoie PAR INTERMITTENCE sa page d'accueil SPA
  // (HTML 200) au lieu du JSON → sans retry, `res.json()` échouait, le statut
  // tombait à « unknown » et le webhook ABANDONNAIT la commande (fulfilled:false),
  // d'où l'accès pas prêt quand le client revient. On réessaie donc les réponses
  // non-JSON / réseau (lecture idempotente : aucun effet de bord à rejouer un GET).
  const MAX_ATTEMPTS = 3;
  let lastError = "Statut GeniusPay indisponible.";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (attempt > 1) await new Promise((r) => setTimeout(r, 250 * (attempt - 1)));
    let res: Response;
    try {
      res = await fetch(`${baseUrl()}/payments/${encodeURIComponent(reference)}`, {
        method: "GET",
        headers: headers(creds),
        cache: "no-store",
      });
    } catch (e) {
      lastError = e instanceof Error ? e.message : "Échec de contact GeniusPay.";
      continue; // réseau : transitoire → réessai
    }

    const ct = res.headers.get("content-type") || "";
    const rawText = await res.text().catch(() => "");
    const json = ct.includes("json") ? safeParse(rawText) : null;
    if (!json) {
      // Réponse non-JSON (page SPA HTML) → transitoire → réessai.
      lastError = `Réponse GeniusPay non-JSON (${res.status}).`;
      continue;
    }
    if (!res.ok) {
      return { ok: false, error: geniusErrorMessage(json, res.status) };
    }

    const raw = String(
      (json.status as string) || ((json.data as Record<string, unknown>)?.status as string) || "",
    ).toLowerCase();
    let status: OrgPaymentStatus = "unknown";
    if (raw === "completed" || raw === "success") status = "completed";
    else if (raw === "pending" || raw === "processing") status = "pending";
    else if (raw === "failed" || raw === "cancelled" || raw === "refunded" || raw === "expired")
      status = "failed";
    return { ok: true, status };
  }
  return { ok: false, error: lastError };
}
