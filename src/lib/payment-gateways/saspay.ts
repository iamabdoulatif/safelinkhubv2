// Client SasPay (https://docs.saspay.me) — API de collecte « softpay » au niveau
// ORG, pour le PORTAIL CAPTIF. Comme CinetPay : clé unique en Bearer (pas d'OAuth),
// et on ne fait PAS confiance au webhook — on reconfirme le statut
// server-to-server (GET /payments/{id}/verify/). Module serveur uniquement.
//
// Flux :
//   • POST /payments/softpay/ (Bearer) { amount, currency:"XOF", country:"CI",
//     network:"mtn_ci"…, customer{…} } + header Idempotency-Key → { id, status,
//     checkout_url }. checkout_url VIDE = push USSD (MTN/Moov, sans internet) ;
//     NON-VIDE = redirection (Wave/Orange) → voie de paiement + redirection client.
//   • GET /payments/{id}/verify/ (Bearer) → { status: SUCCESS|PENDING|FAILED }.

import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { paymentGateways } from "@/lib/db/schema";
import { decryptSecret } from "@/lib/mikrotik/crypto";
import { formatGeniusPayPhone } from "./phone";

export type OrgSaspayCreds = { apiKey: string };

// Prod par défaut ; une clé sk_test_ bascule automatiquement sur le sandbox.
// SASPAY_BASE_URL force l'hôte (dev/CI). L'API vit sous /api/v1.
const PROD_BASE = "https://api.saspay.me/api/v1";
const SANDBOX_BASE = "https://sandbox-api.saspay.me/api/v1";

function baseUrl(apiKey: string): string {
  const override = process.env.SASPAY_BASE_URL?.replace(/\/+$/, "");
  if (override) return override;
  return apiKey.startsWith("sk_test_") ? SANDBOX_BASE : PROD_BASE;
}

/** Clés SasPay ACTIVÉES d'une org. Une seule clé (Bearer), chiffrée telle quelle. */
export async function getOrgSaspayCreds(orgId: string): Promise<OrgSaspayCreds | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(paymentGateways)
    .where(
      and(
        eq(paymentGateways.orgId, orgId),
        eq(paymentGateways.provider, "saspay"),
        eq(paymentGateways.enabled, true),
      ),
    )
    .limit(1);
  if (!row?.apiKeyEncrypted) return null;
  try {
    const apiKey = decryptSecret(row.apiKeyEncrypted).trim();
    return apiKey ? { apiKey } : null;
  } catch {
    return null;
  }
}

// ── Mapping opérateur portail → code réseau SasPay (Côte d'Ivoire) ────────────
const NETWORK_MAP: Record<string, string> = {
  mtn_money: "mtn_ci",
  moov_money: "moov_ci",
  orange_money: "orange_ci",
  wave: "wave_ci",
};

/** Code réseau SasPay CI pour un moyen du portail, ou null si non géré. */
export function saspayNetwork(method: string): string | null {
  return NETWORK_MAP[method] ?? null;
}

// ── Normalisation du statut ──────────────────────────────────────────────────
export type SaspayStatus = "pending" | "completed" | "failed" | "unknown";

const FAILED = new Set(["FAILED", "CANCELLED", "CANCELED", "EXPIRED", "REFUSED"]);

export function normalizeSaspayStatus(raw: string | null | undefined): SaspayStatus {
  const s = (raw ?? "").toUpperCase();
  if (s === "SUCCESS" || s === "SUCCEEDED" || s === "COMPLETED") return "completed";
  if (s === "PENDING" || s === "PROCESSING" || s === "INITIATED") return "pending";
  if (FAILED.has(s)) return "failed";
  return "unknown";
}

// ── Corps de la charge softpay (PUR : testable sans réseau) ───────────────────
export type SaspayChargeInput = {
  /** Notre référence/idempotence (l'UUID de la commande). */
  reference: string;
  amountFcfa: number;
  /** Moyen du portail (mtn_money / wave / …). */
  method: string;
  /** Numéro international du client (« +225… »). */
  phone: string;
  description: string;
};

/**
 * Construit le corps JSON de POST /payments/softpay/. Email/nom en placeholders
 * (requis par l'API mais non pertinents au WiFi, comme CinetPay). XOF est sans
 * décimale mais l'API attend un montant décimal en chaîne (ex. « 2500.00 »).
 */
export function buildSaspaySoftpayBody(
  input: SaspayChargeInput,
  network: string,
): Record<string, unknown> {
  return {
    amount: input.amountFcfa.toFixed(2),
    currency: "XOF",
    country: "CI",
    network,
    description: input.description.slice(0, 255),
    customer: {
      email: "wifi@safelinkhub.io",
      first_name: "Client",
      last_name: "WiFi",
      phone: formatGeniusPayPhone(input.phone),
    },
    metadata: { reference: input.reference },
  };
}

type Envelope<T> = { success?: boolean; data?: T; error?: { message?: string } };

export type SaspayChargeResult =
  | { ok: true; id: string; status: SaspayStatus; checkoutUrl: string | null }
  | { ok: false; error: string };

/**
 * Déclenche la collecte softpay. checkoutUrl non-vide → le client doit être
 * redirigé (Wave/Orange, internet requis) ; vide → push USSD (MTN/Moov).
 */
export async function createSaspayCharge(
  creds: OrgSaspayCreds,
  input: SaspayChargeInput,
): Promise<SaspayChargeResult> {
  const network = saspayNetwork(input.method);
  if (!network) return { ok: false, error: "Opérateur non pris en charge par SasPay." };
  const body = buildSaspaySoftpayBody(input, network);
  try {
    const res = await fetch(`${baseUrl(creds.apiKey)}/payments/softpay/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${creds.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        // Une ré-émission réseau sans cette clé créerait un 2ᵉ vrai paiement.
        "Idempotency-Key": input.reference,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
    const j = (await res.json().catch(() => null)) as Envelope<{
      id?: string;
      status?: string;
      checkout_url?: string;
    }> | null;
    const data = j?.data;
    if (!res.ok || !j?.success || !data?.id) {
      return { ok: false, error: j?.error?.message || `SasPay a refusé la charge (${res.status}).` };
    }
    const checkoutUrl = (data.checkout_url ?? "").trim();
    return {
      ok: true,
      id: data.id,
      status: normalizeSaspayStatus(data.status),
      checkoutUrl: checkoutUrl || null,
    };
  } catch {
    return { ok: false, error: "SasPay injoignable." };
  }
}

export type SaspayStatusResult =
  | { ok: true; status: SaspayStatus }
  | { ok: false; error: string };

/** Statut d'une transaction par son id SasPay (autorité serveur). */
export async function getSaspayStatus(
  creds: OrgSaspayCreds,
  id: string,
): Promise<SaspayStatusResult> {
  try {
    const res = await fetch(`${baseUrl(creds.apiKey)}/payments/${encodeURIComponent(id)}/verify/`, {
      method: "GET",
      headers: { Authorization: `Bearer ${creds.apiKey}`, Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
    const j = (await res.json().catch(() => null)) as Envelope<{ status?: string }> | null;
    if (!res.ok || !j?.data) return { ok: false, error: `Statut SasPay indisponible (${res.status}).` };
    return { ok: true, status: normalizeSaspayStatus(j.data.status) };
  } catch {
    return { ok: false, error: "SasPay injoignable." };
  }
}
