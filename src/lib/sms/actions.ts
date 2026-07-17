"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { smsGateways } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import { encryptSecret } from "@/lib/mikrotik/crypto";
import { sendOrgSms } from "./send";
import { PROVIDERS, type Provider } from "./providers";

export async function listSmsGateways() {
  const session = await getSession();
  if (!session) return [];

  const db = getDb();
  const rows = await db
    .select()
    .from(smsGateways)
    .where(eq(smsGateways.orgId, session.orgId));

  return rows.map((r) => ({
    id: r.id,
    provider: r.provider,
    senderId: r.senderId,
    enabled: r.enabled,
    hasApiKey: Boolean(r.apiKeyEncrypted),
  }));
}

export async function saveSmsGateway(_prevState: unknown, formData: FormData) {
  const session = await getSession();
  if (!session) return { error: "Not authenticated." };

  const provider = String(formData.get("provider") ?? "");
  if (!PROVIDERS.includes(provider as Provider)) {
    return { error: "Passerelle invalide." };
  }

  const senderId = String(formData.get("senderId") ?? "").trim();
  const apiKey = String(formData.get("apiKey") ?? "").trim();
  const enabled = formData.get("enabled") === "on";

  const db = getDb();
  const [existing] = await db
    .select()
    .from(smsGateways)
    .where(and(eq(smsGateways.orgId, session.orgId), eq(smsGateways.provider, provider)))
    .limit(1);

  const apiKeyEncrypted = apiKey ? encryptSecret(apiKey) : existing?.apiKeyEncrypted ?? null;

  if (existing) {
    await db
      .update(smsGateways)
      .set({ senderId: senderId || null, apiKeyEncrypted, enabled, updatedAt: new Date() })
      .where(eq(smsGateways.id, existing.id));
  } else {
    await db.insert(smsGateways).values({
      orgId: session.orgId,
      provider,
      senderId: senderId || null,
      apiKeyEncrypted,
      enabled,
    });
  }

  revalidatePath("/admin/settings/sms");
  return { success: true };
}

export async function sendTestSms(_prevState: unknown, formData: FormData) {
  const session = await getSession();
  if (!session) return { error: "Not authenticated." };

  const to = String(formData.get("to") ?? "").trim();
  if (!to) return { error: "Numéro destinataire requis." };

  const content =
    String(formData.get("content") ?? "").trim() ||
    "Test SafeLinkHub : votre passerelle SMS Wassoya fonctionne.";

  const result = await sendOrgSms({ orgId: session.orgId, to, content });
  if (!result.ok) return { error: result.error };
  return { success: true, messageId: result.messageId };
}
