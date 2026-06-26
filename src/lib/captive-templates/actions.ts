"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { bridges, captiveTemplates, routers, organizations } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import { connectToRouter } from "@/lib/mikrotik/router-sync";
import { getRouterPrimarySsid, uploadCaptiveTemplatePackage } from "@/lib/mikrotik/captive-template-upload";
import type { PackageFile } from "./package-files";

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

/**
 * Imports the bundled SafeLinkHub multi-file hotspot portal as a
 * "package" template for the current org, so it shows up in
 * /admin/settings/captive-templates next to the parametric ones and can
 * be assigned to any bridge — assigning it is what triggers the actual
 * upload to the router (see assignTemplateToBridge).
 */
export async function importSafelinkhubDefaultPackage() {
  const session = await getSession();
  if (!session) return { error: "Not authenticated." };

  const db = getDb();
  const existing = await db
    .select({ id: captiveTemplates.id })
    .from(captiveTemplates)
    .where(eq(captiveTemplates.orgId, session.orgId));

  const { loadSafelinkhubDefaultPackage } = await import("./package-files");
  const [row] = await db
    .insert(captiveTemplates)
    .values({
      orgId: session.orgId,
      name: "SafeLinkHub Hotspot (portail complet)",
      isDefault: existing.length === 0,
      templateType: "package",
      packageFiles: loadSafelinkhubDefaultPackage(),
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
  let template: typeof captiveTemplates.$inferSelect | null = null;
  if (templateId) {
    const [row] = await db
      .select()
      .from(captiveTemplates)
      .where(eq(captiveTemplates.id, templateId))
      .limit(1);
    if (!row || row.orgId !== session.orgId) {
      return { error: "Modèle introuvable." };
    }
    template = row;
  }

  await db
    .update(bridges)
    .set({ captiveTemplateId: templateId })
    .where(eq(bridges.id, bridgeId));

  revalidatePath("/admin/settings/captive-templates");
  revalidatePath("/admin/settings/router-setup");

  if (!template || template.templateType !== "package") {
    return { success: true };
  }

  return uploadPackageTemplateToBridge(bridgeId, template);
}

/**
 * Pushes a "package" template's files to the router behind a bridge,
 * renaming the portal to the router's live WiFi SSID along the way. This
 * is the automation step: assigning a multi-file portal in the UI is
 * enough to install it, no manual WinBox/FTP upload required.
 */
async function uploadPackageTemplateToBridge(
  bridgeId: string,
  template: typeof captiveTemplates.$inferSelect,
) {
  const db = getDb();
  const [bridge] = await db.select().from(bridges).where(eq(bridges.id, bridgeId)).limit(1);
  if (!bridge) return { error: "Bridge introuvable." };

  const [router] = await db.select().from(routers).where(eq(routers.id, bridge.routerId)).limit(1);
  if (!router) return { error: "Routeur introuvable." };

  const [org] = await db
    .select({ slug: organizations.slug })
    .from(organizations)
    .where(eq(organizations.id, router.orgId))
    .limit(1);
  if (!org) return { error: "Organisation introuvable." };

  const files = (template.packageFiles as PackageFile[] | null) ?? [];
  if (files.length === 0) {
    return { error: "Ce modèle ne contient aucun fichier." };
  }

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  const fileBaseUrl = `${appUrl}/api/router/v1/${org.slug}/captive-template/${template.id}`;
  const htmlDirectory = `${bridge.name}-portal`;

  let client;
  try {
    client = await connectToRouter(router);
  } catch (err) {
    return {
      error: err instanceof Error ? `Connexion au routeur impossible : ${err.message}` : "Connexion au routeur impossible.",
    };
  }

  try {
    const ssid = (await getRouterPrimarySsid(client)) || bridge.name;

    await client
      .talk(["/ip/hotspot/profile/set", `=numbers=${bridge.name}-profile`, `=html-directory=${htmlDirectory}`])
      .catch(() => {});

    const result = await uploadCaptiveTemplatePackage(client, {
      files,
      htmlDirectory,
      fileBaseUrl,
      ssid,
    });

    if (result.failed.length > 0) {
      return {
        success: true,
        partial: true,
        ssid,
        uploaded: result.uploaded.length,
        failed: result.failed,
      };
    }

    return { success: true, ssid, uploaded: result.uploaded.length };
  } catch (err) {
    return {
      error: err instanceof Error ? `Échec de l'installation du portail : ${err.message}` : "Échec de l'installation du portail.",
    };
  } finally {
    client.close();
  }
}
