"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { paymentGateways } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import { encryptSecret } from "@/lib/mikrotik/crypto";
import { getOrgGeniusCreds, getOrgGeniusBalance, ensureOrgWebhook, forgetOrgWebhook, type GeniusBalance } from "./geniuspay-org";
import { PROVIDERS, type Provider } from "./providers";

export async function listPaymentGateways() {
  const session = await getSession();
  if (!session) return [];

  const db = getDb();
  const rows = await db
    .select()
    .from(paymentGateways)
    .where(eq(paymentGateways.orgId, session.orgId));

  return rows.map((r) => ({
    id: r.id,
    provider: r.provider,
    merchantId: r.merchantId,
    enabled: r.enabled,
    hasApiKey: Boolean(r.apiKeyEncrypted),
  }));
}

export async function savePaymentGateway(_prevState: unknown, formData: FormData) {
  const session = await getSession();
  if (!session) return { error: "Not authenticated." };

  const provider = String(formData.get("provider") ?? "");
  if (!PROVIDERS.includes(provider as Provider)) {
    return { error: "Passerelle invalide." };
  }

  const merchantId = String(formData.get("merchantId") ?? "").trim();
  const apiKey = String(formData.get("apiKey") ?? "").trim();
  const enabled = formData.get("enabled") === "on";

  const db = getDb();
  const [existing] = await db
    .select()
    .from(paymentGateways)
    .where(
      and(
        eq(paymentGateways.orgId, session.orgId),
        eq(paymentGateways.provider, provider),
      ),
    )
    .limit(1);

  const apiKeyEncrypted = apiKey ? encryptSecret(apiKey) : existing?.apiKeyEncrypted ?? null;
  // Un changement de compte/clés rend le secret du webhook précédent invalide.
  // On l'efface pour qu'ensureOrgWebhook crée un endpoint signé sur le nouveau
  // compte, sans jamais accepter une signature d'un ancien marchand.
  const geniusCredentialsChanged =
    provider === "genius_pay" &&
    (Boolean(apiKey) || (merchantId.length > 0 && merchantId !== (existing?.merchantId ?? "")));

  if (existing) {
    await db
      .update(paymentGateways)
      .set({
        merchantId: merchantId || null,
        apiKeyEncrypted,
        enabled,
        ...(geniusCredentialsChanged ? { webhookId: null, webhookSecretEncrypted: null } : {}),
        updatedAt: new Date(),
      })
      .where(eq(paymentGateways.id, existing.id));
  } else {
    await db.insert(paymentGateways).values({
      orgId: session.orgId,
      provider,
      merchantId: merchantId || null,
      apiKeyEncrypted,
      enabled,
    });
  }

  // GeniusPay actif : enregistre le webhook sur le compte de l'org pour que le
  // portail captif soit notifié des paiements (best-effort — n'échoue pas la
  // sauvegarde ; le portail retombe sur le polling si ça rate). Si les clés ont
  // changé, le secret précédent vient d'être supprimé afin de créer un webhook
  // signé propre au nouveau compte.
  if (provider === "genius_pay" && enabled) {
    forgetOrgWebhook(session.orgId);
    const creds = await getOrgGeniusCreds(session.orgId);
    if (creds) await ensureOrgWebhook(creds, session.orgId);
  }

  revalidatePath("/admin/settings/payment-gateways");
  return { success: true };
}

/**
 * Solde GeniusPay de l'organisation (lecture seule). Renvoie null si l'org n'a
 * pas de clés GeniusPay activées (rien à afficher), ou une erreur si l'appel a
 * échoué. Ne déclenche AUCUN mouvement d'argent.
 */
export async function getGeniusPayBalance(): Promise<
  { ok: true; balance: GeniusBalance } | { ok: false; error: string } | null
> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Non authentifié." };
  const creds = await getOrgGeniusCreds(session.orgId);
  if (!creds) return null; // pas de compte GeniusPay actif → pas de carte
  return getOrgGeniusBalance(creds);
}
