"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { bridges, captiveTemplates } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";

export type CaptiveTemplateInput = {
  name: string;
  logoUrl: string;
  backgroundUrl: string;
  primaryColor: string;
  backgroundColor: string;
  title: string;
  subtitle: string;
  buttonLabel: string;
  voucherFieldLabel: string;
  termsText: string;
  footerText: string;
  mobileMoneyEnabled: boolean;
};

function readInput(formData: FormData): CaptiveTemplateInput {
  const get = (key: string) => String(formData.get(key) ?? "").trim();
  return {
    name: get("name"),
    logoUrl: get("logoUrl"),
    backgroundUrl: get("backgroundUrl"),
    primaryColor: get("primaryColor") || "#0f172a",
    backgroundColor: get("backgroundColor") || "#f8fafc",
    title: get("title"),
    subtitle: get("subtitle"),
    buttonLabel: get("buttonLabel"),
    voucherFieldLabel: get("voucherFieldLabel"),
    termsText: get("termsText"),
    footerText: get("footerText"),
    mobileMoneyEnabled: formData.get("mobileMoneyEnabled") === "on",
  };
}

export async function listCaptiveTemplates() {
  const session = await getSession();
  if (!session) return [];

  const db = getDb();
  const rows = await db
    .select()
    .from(captiveTemplates)
    .where(eq(captiveTemplates.orgId, session.orgId));

  return rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function createCaptiveTemplate(_prevState: unknown, formData: FormData) {
  const session = await getSession();
  if (!session) return { error: "Not authenticated." };

  const input = readInput(formData);
  if (!input.name) return { error: "Le nom du modèle est requis." };

  const db = getDb();
  const existing = await db
    .select({ id: captiveTemplates.id })
    .from(captiveTemplates)
    .where(eq(captiveTemplates.orgId, session.orgId));

  const [row] = await db
    .insert(captiveTemplates)
    .values({
      orgId: session.orgId,
      isDefault: existing.length === 0,
      ...input,
      logoUrl: input.logoUrl || null,
      backgroundUrl: input.backgroundUrl || null,
      title: input.title || "Bienvenue sur le réseau Wi-Fi",
      subtitle: input.subtitle || "Entrez votre code d'accès pour vous connecter.",
      buttonLabel: input.buttonLabel || "Se connecter",
      voucherFieldLabel: input.voucherFieldLabel || "Code d'accès",
      termsText: input.termsText || null,
      footerText: input.footerText || null,
    })
    .returning();

  revalidatePath("/admin/settings/captive-templates");
  return { success: true, id: row.id };
}

export async function updateCaptiveTemplate(
  templateId: string,
  _prevState: unknown,
  formData: FormData,
) {
  const session = await getSession();
  if (!session) return { error: "Not authenticated." };

  const db = getDb();
  const [existing] = await db
    .select()
    .from(captiveTemplates)
    .where(eq(captiveTemplates.id, templateId))
    .limit(1);
  if (!existing || existing.orgId !== session.orgId) {
    return { error: "Modèle introuvable." };
  }

  const input = readInput(formData);
  if (!input.name) return { error: "Le nom du modèle est requis." };

  await db
    .update(captiveTemplates)
    .set({
      ...input,
      logoUrl: input.logoUrl || null,
      backgroundUrl: input.backgroundUrl || null,
      termsText: input.termsText || null,
      footerText: input.footerText || null,
      updatedAt: new Date(),
    })
    .where(eq(captiveTemplates.id, templateId));

  revalidatePath("/admin/settings/captive-templates");
  return { success: true };
}

export async function duplicateCaptiveTemplate(templateId: string) {
  const session = await getSession();
  if (!session) return { error: "Not authenticated." };

  const db = getDb();
  const [existing] = await db
    .select()
    .from(captiveTemplates)
    .where(eq(captiveTemplates.id, templateId))
    .limit(1);
  if (!existing || existing.orgId !== session.orgId) {
    return { error: "Modèle introuvable." };
  }

  await db.insert(captiveTemplates).values({
    orgId: session.orgId,
    name: `${existing.name} (copie)`,
    isDefault: false,
    logoUrl: existing.logoUrl,
    backgroundUrl: existing.backgroundUrl,
    primaryColor: existing.primaryColor,
    backgroundColor: existing.backgroundColor,
    title: existing.title,
    subtitle: existing.subtitle,
    buttonLabel: existing.buttonLabel,
    voucherFieldLabel: existing.voucherFieldLabel,
    termsText: existing.termsText,
    footerText: existing.footerText,
    mobileMoneyEnabled: existing.mobileMoneyEnabled,
  });

  revalidatePath("/admin/settings/captive-templates");
  return { success: true };
}

export async function setDefaultCaptiveTemplate(templateId: string) {
  const session = await getSession();
  if (!session) return { error: "Not authenticated." };

  const db = getDb();
  const [existing] = await db
    .select()
    .from(captiveTemplates)
    .where(eq(captiveTemplates.id, templateId))
    .limit(1);
  if (!existing || existing.orgId !== session.orgId) {
    return { error: "Modèle introuvable." };
  }

  await db
    .update(captiveTemplates)
    .set({ isDefault: false })
    .where(eq(captiveTemplates.orgId, session.orgId));
  await db
    .update(captiveTemplates)
    .set({ isDefault: true })
    .where(eq(captiveTemplates.id, templateId));

  revalidatePath("/admin/settings/captive-templates");
  return { success: true };
}

export async function deleteCaptiveTemplate(templateId: string) {
  const session = await getSession();
  if (!session) return { error: "Not authenticated." };

  const db = getDb();
  const [existing] = await db
    .select()
    .from(captiveTemplates)
    .where(eq(captiveTemplates.id, templateId))
    .limit(1);
  if (!existing || existing.orgId !== session.orgId) {
    return { error: "Modèle introuvable." };
  }

  const [usedBy] = await db
    .select({ id: bridges.id })
    .from(bridges)
    .where(eq(bridges.captiveTemplateId, templateId))
    .limit(1);
  if (usedBy) {
    return {
      error: "Ce modèle est assigné à au moins un bridge. Retirez-le de ce bridge avant de le supprimer.",
    };
  }

  await db.delete(captiveTemplates).where(eq(captiveTemplates.id, templateId));

  if (existing.isDefault) {
    const [next] = await db
      .select({ id: captiveTemplates.id })
      .from(captiveTemplates)
      .where(eq(captiveTemplates.orgId, session.orgId))
      .limit(1);
    if (next) {
      await db
        .update(captiveTemplates)
        .set({ isDefault: true })
        .where(eq(captiveTemplates.id, next.id));
    }
  }

  revalidatePath("/admin/settings/captive-templates");
  return { success: true };
}

export async function assignTemplateToBridge(bridgeId: string, templateId: string | null) {
  const session = await getSession();
  if (!session) return { error: "Not authenticated." };

  const db = getDb();
  if (templateId) {
    const [template] = await db
      .select({ orgId: captiveTemplates.orgId })
      .from(captiveTemplates)
      .where(eq(captiveTemplates.id, templateId))
      .limit(1);
    if (!template || template.orgId !== session.orgId) {
      return { error: "Modèle introuvable." };
    }
  }

  await db
    .update(bridges)
    .set({ captiveTemplateId: templateId })
    .where(eq(bridges.id, bridgeId));

  revalidatePath("/admin/settings/captive-templates");
  revalidatePath("/admin/settings/router-setup");
  return { success: true };
}
