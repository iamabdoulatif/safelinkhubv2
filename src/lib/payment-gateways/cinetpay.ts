// Client CinetPay — API DIRECTE de collecte (api.cinetpay.co), au niveau ORG,
// pour le PORTAIL CAPTIF. Contrairement à GeniusPay/PaiementPro (page hébergée
// qui exige un webview/app avec internet), l'API directe déclenche la validation
// mobile money par PUSH/USSD sur le réseau CELLULAIRE (MTN *133#, Moov code
// secret) : AUCUNE donnée internet requise côté client → utilisable sur le
// captif AVANT paiement, là où MTN/Moov via PaiementPro échouaient (voir
// [[mtn-momo-captive-limit]]). Module serveur uniquement.
//
// Flux (SDK officiel cinetpay-go) :
//   • POST /v1/oauth/login { api_key, api_password } → { access_token } (~23 h).
//   • POST /v1/payment (Bearer) channel=PUSH payment_method=MTN_CI direct_pay=true
//     client_phone_number=+225… → CinetPay déclenche l'USSD ; renvoie
//     transaction_id + notify_token.
//   • GET /v1/payment/{id} (Bearer) → statut.
//   • Webhook : POST { notify_token, transaction_id, merchant_transaction_id } ;
//     on reconfirme par GET statut (autorité serveur), comme le polling GeniusPay.

import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { paymentGateways } from "@/lib/db/schema";
import { decryptSecret } from "@/lib/mikrotik/crypto";

// Production api.cinetpay.co ; sandbox api.cinetpay.net. Surchargeable par env.
const DEFAULT_BASE_URL = "https://api.cinetpay.co";

function baseUrl(): string {
  return (process.env.CINETPAY_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

export type OrgCinetpayCreds = { apiKey: string; apiPassword: string };

/**
 * Charge les clés cinetpay ACTIVÉES d'une org. Les deux secrets (api_key sk_live_
 * et api_password) sont stockés chiffrés EN BLOC JSON dans apiKeyEncrypted —
 * évite une migration de colonne ; merchantId reste libre (label/pays).
 */
export async function getOrgCinetpayCreds(orgId: string): Promise<OrgCinetpayCreds | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(paymentGateways)
    .where(
      and(
        eq(paymentGateways.orgId, orgId),
        eq(paymentGateways.provider, "cinetpay"),
        eq(paymentGateways.enabled, true),
      ),
    )
    .limit(1);
  if (!row?.apiKeyEncrypted) return null;
  try {
    const { apiKey, apiPassword } = JSON.parse(decryptSecret(row.apiKeyEncrypted)) as OrgCinetpayCreds;
    if (!apiKey || !apiPassword) return null;
    return { apiKey, apiPassword };
  } catch {
    return null;
  }
}

// ── Mapping opérateur portail → code CinetPay (Côte d'Ivoire) ────────────────
const METHOD_MAP: Record<string, string> = {
  mtn_money: "MTN_CI",
  moov_money: "MOOV_CI",
  orange_money: "OM_CI",
  wave: "WAVE_CI",
};

/** Code CinetPay CI pour un moyen du portail, ou null si non géré. */
export function cinetpayMethod(method: string): string | null {
  return METHOD_MAP[method] ?? null;
}

// ── Normalisation du statut (enum du SDK) ────────────────────────────────────
export type CinetpayStatus = "pending" | "completed" | "failed" | "unknown";

const FAILED_STATUSES = new Set([
  "FAILED", "REFUSED", "EXPIRED", "CANCELED", "CANCELLED", "OTP_ERROR", "OTP_EXPIRED",
  "INSUFFICIENT_BALANCE", "USER_NOT_FOUND", "USER_IS_BLOCKED", "NOT_ALLOWED", "OPERATION_ERROR",
]);

export function normalizeCinetpayStatus(raw: string | null | undefined): CinetpayStatus {
  const s = (raw ?? "").toUpperCase();
  if (s === "SUCCESS" || s === "OK" || s === "ACCEPTED") return "completed";
  if (s === "PENDING" || s === "INITIATED" || s === "WAITING_FOR_CUSTOMER") return "pending";
  if (FAILED_STATUSES.has(s)) return "failed";
  return "unknown";
}

// ── Corps de la charge directe (PUR : testable sans réseau) ───────────────────
export type CinetpayChargeInput = {
  /** Notre référence, ≤ 30 caractères (contrainte API), unique et mappable à la commande. */
  merchantTransactionId: string;
  amountFcfa: number;
  /** Moyen du portail (mtn_money / moov_money / …). */
  method: string;
  /** Numéro international du client, « +225… ». */
  phone: string;
  designation: string;
  notifyUrl: string;
  successUrl: string;
  failedUrl: string;
  customerName?: string;
};

/**
 * Construit le corps JSON de POST /v1/payment en PUSH direct. Placeholders pour
 * les champs requis mais non pertinents au WiFi (email/nom). Les URL doivent
 * rester ≤ 120 caractères (contrainte API) — à garantir côté appelant.
 */
export function buildCinetpayChargeBody(input: CinetpayChargeInput, method: string): Record<string, unknown> {
  return {
    currency: "XOF",
    merchant_transaction_id: input.merchantTransactionId,
    amount: input.amountFcfa,
    lang: "fr",
    designation: input.designation.slice(0, 255),
    client_email: "wifi@safelinkhub.io",
    client_first_name: (input.customerName || "Client").slice(0, 255),
    client_last_name: "WiFi",
    success_url: input.successUrl,
    failed_url: input.failedUrl,
    notify_url: input.notifyUrl,
    channel: "PUSH",
    payment_method: method,
    client_phone_number: input.phone,
    direct_pay: true,
  };
}

// ── Jeton d'accès (cache mémoire par clé, TTL < 23 h du SDK) ──────────────────
const tokenCache = new Map<string, { token: string; exp: number }>();

async function login(creds: OrgCinetpayCreds): Promise<string | null> {
  const cached = tokenCache.get(creds.apiKey);
  if (cached && cached.exp > Date.now()) return cached.token;
  try {
    const res = await fetch(`${baseUrl()}/v1/oauth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ api_key: creds.apiKey, api_password: creds.apiPassword }),
      signal: AbortSignal.timeout(15000),
    });
    const j = (await res.json().catch(() => null)) as { access_token?: string } | null;
    const token = j?.access_token;
    if (!token) return null;
    // 22 h : marge sous le TTL ~23 h, re-login transparent si l'API dit expiré.
    tokenCache.set(creds.apiKey, { token, exp: Date.now() + 22 * 3600 * 1000 });
    return token;
  } catch {
    return null;
  }
}

/** Invalide le jeton caché (sur EXPIRED_TOKEN) pour forcer un re-login. */
function dropToken(apiKey: string): void {
  tokenCache.delete(apiKey);
}

export type CinetpayChargeResult =
  | { ok: true; transactionId: string; notifyToken: string | null; status: CinetpayStatus; mustBeRedirected: boolean; paymentUrl: string | null }
  | { ok: false; error: string };

/** Déclenche la collecte PUSH/USSD. Le client approuve sur son téléphone (cellulaire). */
export async function createCinetpayCharge(
  creds: OrgCinetpayCreds,
  input: CinetpayChargeInput,
): Promise<CinetpayChargeResult> {
  const method = cinetpayMethod(input.method);
  if (!method) return { ok: false, error: "Opérateur non pris en charge par CinetPay." };
  const token = await login(creds);
  if (!token) return { ok: false, error: "Authentification CinetPay impossible." };
  const body = buildCinetpayChargeBody(input, method);
  try {
    const res = await fetch(`${baseUrl()}/v1/payment`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
    const j = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!j) return { ok: false, error: `Réponse CinetPay non-JSON (${res.status}).` };
    const details = (j.details ?? {}) as Record<string, unknown>;
    const tx = (j.transaction_id as string) || "";
    if (!tx) {
      return { ok: false, error: String(details.message || j.message || `Échec CinetPay (${res.status}).`).slice(0, 300) };
    }
    return {
      ok: true,
      transactionId: tx,
      notifyToken: (j.notify_token as string) ?? null,
      status: normalizeCinetpayStatus((details.status as string) || (j.status as string)),
      mustBeRedirected: Boolean(details.must_be_redirected),
      paymentUrl: (j.payment_url as string) || null,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Appel CinetPay impossible." };
  }
}

/** Statut server-to-server d'une transaction (identifier = merchant_transaction_id ou transaction_id). */
export async function getCinetpayStatus(
  creds: OrgCinetpayCreds,
  identifier: string,
): Promise<{ ok: true; status: CinetpayStatus } | { ok: false; error: string }> {
  let token = await login(creds);
  if (!token) return { ok: false, error: "Authentification CinetPay impossible." };
  const call = async (t: string) =>
    fetch(`${baseUrl()}/v1/payment/${encodeURIComponent(identifier)}`, {
      headers: { Authorization: `Bearer ${t}`, Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
  try {
    let res = await call(token);
    if (res.status === 401) {
      dropToken(creds.apiKey);
      token = (await login(creds)) ?? "";
      if (!token) return { ok: false, error: "Authentification CinetPay impossible." };
      res = await call(token);
    }
    const j = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!j) return { ok: false, error: `Réponse CinetPay non-JSON (${res.status}).` };
    return { ok: true, status: normalizeCinetpayStatus(j.status as string) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Appel CinetPay impossible." };
  }
}
