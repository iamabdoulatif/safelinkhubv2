// Statut de paiement d'une commande portail, selon sa passerelle. Un seul point
// d'aiguillage pour /status et la réconciliation : GeniusPay (défaut) ou CinetPay
// (MTN/Moov en API directe). Les deux renvoient le même vocabulaire de statut.

import { getOrgGeniusCreds, getOrgPaymentStatus } from "@/lib/payment-gateways/geniuspay-org";
import { getCinetpayStatus, getOrgCinetpayCreds } from "@/lib/payment-gateways/cinetpay";

export type PortalPaymentStatus = "pending" | "completed" | "failed" | "unknown";

export type PortalPaymentCheck =
  | { ok: true; status: PortalPaymentStatus }
  | { ok: false; error: string; reason: "no_gateway" | "check_failed" };

/** Interroge la bonne passerelle pour le statut d'un paiement (référence = merchant_transaction_id côté CinetPay). */
export async function checkPortalPaymentStatus(
  orgId: string,
  provider: string | null | undefined,
  reference: string,
): Promise<PortalPaymentCheck> {
  if (provider === "cinetpay") {
    const creds = await getOrgCinetpayCreds(orgId);
    if (!creds) return { ok: false, error: "Passerelle CinetPay indisponible.", reason: "no_gateway" };
    const st = await getCinetpayStatus(creds, reference);
    if (!st.ok) return { ok: false, error: `Confirmation CinetPay indisponible : ${st.error}`, reason: "check_failed" };
    return { ok: true, status: st.status };
  }
  const creds = await getOrgGeniusCreds(orgId);
  if (!creds) return { ok: false, error: "Passerelle GeniusPay indisponible.", reason: "no_gateway" };
  const gp = await getOrgPaymentStatus(creds, reference);
  if (!gp.ok) return { ok: false, error: `Confirmation GeniusPay indisponible : ${gp.error}`, reason: "check_failed" };
  return { ok: true, status: gp.status };
}
