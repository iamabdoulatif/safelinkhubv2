"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { paymentGateways } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import { encryptSecret } from "@/lib/mikrotik/crypto";
import { getOrgGeniusCreds, ensureOrgWebhook, forgetOrgWebhook } from "./geniuspay-org";
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

  if (existing) {
    await db
      .update(paymentGateways)
      .set({ merchantId: merchantId || null, apiKeyEncrypted, enabled, updatedAt: new Date() })
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
  // sauvegarde ; le portail retombe sur le polling si ça rate). `force` car les
  // clés viennent peut-être de changer (nouveau compte GeniusPay).
  if (provider === "genius_pay" && enabled) {
    forgetOrgWebhook(session.orgId);
    const creds = await getOrgGeniusCreds(session.orgId);
    if (creds) await ensureOrgWebhook(creds, session.orgId, { force: true });
  }

  revalidatePath("/admin/settings/payment-gateways");
  return { success: true };
}
