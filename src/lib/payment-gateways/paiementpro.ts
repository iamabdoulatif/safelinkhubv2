// PaiementPro via GeniusPay (payment_method="paiementpro") : la page de
// paiement hébergée chez PaiementPro fait d'abord choisir PAYS puis OPÉRATEUR.
// Le client l'a DÉJÀ choisi sur notre page : on présélectionne le canal côté
// serveur (même appel que leur page : setTranChannel.php) et on envoie le
// client directement sur l'étape de paiement de l'opérateur. Vérifié le
// 13/10/2026 : Orange CI → page officielle Orange Money (#144*82# / Max it),
// MTN CI / Moov CI → formulaire PaiementPro de l'opérateur.

const BASE = "https://www.paiementpro.net/webservice/onlinepayment";

/** Canal PaiementPro par (méthode du portail, pays). Côte d'Ivoire seulement
 * pour l'instant : ailleurs, le client choisit sur la page PaiementPro. */
const CHANNELS: Record<string, Record<string, string>> = {
  CI: { orange_money: "OMCIV2", mtn_money: "MOMOCI", moov_money: "FLOOZ" },
};

export function paiementProChannel(method: string, iso2: string | undefined): string | null {
  return (iso2 && CHANNELS[iso2]?.[method]) || null;
}

/** sessionid d'une URL de paiement PaiementPro, ou null. */
export function paiementProSession(paymentUrl: string): string | null {
  try {
    const u = new URL(paymentUrl);
    if (!/(^|\.)paiementpro\.net$/i.test(u.hostname)) return null;
    return u.searchParams.get("sessionid");
  } catch {
    return null;
  }
}

/**
 * Présélectionne l'opérateur et renvoie l'URL de l'étape de paiement ; en cas
 * d'échec (canal inconnu, réponse ≠ "0", réseau), renvoie l'URL d'origine —
 * le client choisira lui-même sur la page PaiementPro.
 */
export async function preselectPaiementPro(
  paymentUrl: string,
  method: string,
  iso2: string | undefined,
): Promise<string> {
  const session = paiementProSession(paymentUrl);
  const channel = paiementProChannel(method, iso2);
  if (!session || !channel) return paymentUrl;
  try {
    const res = await fetch(`${BASE}/v2/setTranChannel.php`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
      body: `sessionid=${encodeURIComponent(session)}&channel=${encodeURIComponent(channel)}`,
      signal: AbortSignal.timeout(6000),
    });
    const code = (await res.text()).trim();
    if (code !== "0") return paymentUrl;
    return `${BASE}/processing_v2.php?sessionid=${encodeURIComponent(session)}`;
  } catch {
    return paymentUrl;
  }
}
