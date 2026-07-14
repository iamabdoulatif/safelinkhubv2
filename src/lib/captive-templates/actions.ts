"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { bridges, captiveTemplates, routers, organizations } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import { getAppUrl } from "@/lib/net/app-url";
import { connectToRouter } from "@/lib/mikrotik/router-sync";
import { getRouterPrimarySsid, uploadCaptiveTemplatePackage } from "@/lib/mikrotik/captive-template-upload";
import { ensureWalledGarden } from "@/lib/mikrotik/walled-garden";
import { getOrgWalledGardenDisabledHosts } from "@/lib/mikrotik/walled-garden-config";
import { HOTSPOT_BRIDGE_NAME } from "@/lib/mikrotik/constants";
import {
  autoParameterizePortalFiles,
  PORTAL_ALLOWED_EXTENSIONS,
  type PackageFile,
  type PackageVendor,
} from "./package-files";

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
 * Imports a bundled multi-file hotspot portal as a "package" template for
 * the current org, so it shows up in /admin/settings/captive-templates
 * next to the parametric ones and can be assigned to any bridge —
 * assigning it is what triggers the actual upload to the router (see
 * assignTemplateToBridge).
 *
 * Re-importing used to always INSERT a new row with whatever files were
 * on disk at that moment — every click created another byte-different
 * duplicate (each capturing a different snapshot of css/js as those
 * files got edited over time). Refreshes the org's existing row with
 * this name in place instead of piling up copies; only inserts when none
 * exists yet.
 */
async function importBundledPackage(name: string, files: PackageFile[]) {
  const session = await getSession();
  if (!session) return { error: "Not authenticated." };

  const db = getDb();
  const [existingBundled] = await db
    .select({ id: captiveTemplates.id })
    .from(captiveTemplates)
    .where(
      and(
        eq(captiveTemplates.orgId, session.orgId),
        eq(captiveTemplates.name, name),
        eq(captiveTemplates.templateType, "package"),
      ),
    )
    .limit(1);

  if (existingBundled) {
    await db
      .update(captiveTemplates)
      .set({ packageFiles: files, updatedAt: new Date() })
      .where(eq(captiveTemplates.id, existingBundled.id));
    revalidatePath("/admin/settings/captive-templates");
    return { success: true, id: existingBundled.id };
  }

  const [anyExisting] = await db
    .select({ id: captiveTemplates.id })
    .from(captiveTemplates)
    .where(eq(captiveTemplates.orgId, session.orgId))
    .limit(1);

  const [row] = await db
    .insert(captiveTemplates)
    .values({
      orgId: session.orgId,
      name,
      isDefault: !anyExisting,
      templateType: "package",
      packageFiles: files,
    })
    .returning();

  revalidatePath("/admin/settings/captive-templates");
  return { success: true, id: row.id };
}

export async function importSafelinkhubDefaultPackage() {
  const { loadSafelinkhubDefaultPackage } = await import("./package-files");
  return importBundledPackage("hotspot-sfh1", loadSafelinkhubDefaultPackage());
}

// Guards for operator-uploaded portals: enough headroom for a full
// multi-page portal with images/fonts, small enough to keep the jsonb row
// and the Server Action payload reasonable.
const PORTAL_MAX_FILES = 80;
const PORTAL_MAX_TOTAL_BYTES = 6 * 1024 * 1024;

/**
 * Imports an operator-uploaded portal folder (login.html + css/js/img) as
 * a "package" template, after validating paths/extensions/size and
 * running the import-time auto-parameterization (SSID, forfaits, prix,
 * téléphone — see autoParameterizePortalFiles). The imported portal then
 * behaves exactly like the bundled ones: choisissable dans l'auto-setup,
 * assignable à un bridge, rendu avec les Forfaits actifs de l'org au
 * moment de l'installation sur le routeur.
 */
export async function importCustomPackageTemplate(payload: {
  name: string;
  files: PackageFile[];
}) {
  const session = await getSession();
  if (!session) return { error: "Not authenticated." };

  const name = payload.name.trim();
  if (!name) return { error: "Le nom du portail est requis." };
  if (!Array.isArray(payload.files) || payload.files.length === 0) {
    return { error: "Aucun fichier reçu — sélectionnez le dossier du portail." };
  }
  if (payload.files.length > PORTAL_MAX_FILES) {
    return { error: `Trop de fichiers (${payload.files.length}) — maximum ${PORTAL_MAX_FILES}.` };
  }

  let totalBytes = 0;
  const seenPaths = new Set<string>();
  for (const file of payload.files) {
    const filePath = String(file.path ?? "").replaceAll("\\", "/");
    if (
      !filePath ||
      filePath.startsWith("/") ||
      filePath.split("/").some((segment) => !segment || segment === ".." || segment.startsWith("."))
    ) {
      return { error: `Chemin de fichier invalide : "${file.path}".` };
    }
    if (seenPaths.has(filePath)) {
      return { error: `Fichier en double dans le dossier : "${filePath}".` };
    }
    seenPaths.add(filePath);
    const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
    if (!PORTAL_ALLOWED_EXTENSIONS.has(ext)) {
      return {
        error: `Extension non autorisée : "${filePath}". Autorisées : ${[...PORTAL_ALLOWED_EXTENSIONS].join(", ")}.`,
      };
    }
    if (file.encoding !== "utf8" && file.encoding !== "base64") {
      return { error: `Encodage invalide pour "${filePath}".` };
    }
    totalBytes +=
      file.encoding === "base64"
        ? Math.floor((file.content.length * 3) / 4)
        : Buffer.byteLength(file.content, "utf8");
  }
  if (totalBytes > PORTAL_MAX_TOTAL_BYTES) {
    return {
      error: `Portail trop volumineux (${(totalBytes / (1024 * 1024)).toFixed(1)} Mo) — maximum ${PORTAL_MAX_TOTAL_BYTES / (1024 * 1024)} Mo. Compressez les images.`,
    };
  }
  if (!seenPaths.has("login.html")) {
    return {
      error:
        "Le dossier doit contenir un login.html à sa racine — c'est la page que RouterOS sert aux clients du hotspot.",
    };
  }

  const normalized = payload.files.map((f) => ({
    path: String(f.path).replaceAll("\\", "/"),
    content: f.content,
    encoding: f.encoding,
  }));
  const { files, substitutions } = autoParameterizePortalFiles(normalized);

  const result = await importBundledPackage(name, files);
  if ("error" in result && result.error) return result;
  return { ...result, substitutions };
}

export async function importYahyaWifiPackage() {
  // Second bundled portal choice (the SafeLink Africa / Yahya design),
  // named "hotspot-sfh2" to sit alongside the SafeLinkHub "hotspot-sfh1"
  // in the operator's portal list.
  const { loadYahyaWifiPackage } = await import("./package-files");
  return importBundledPackage("hotspot-sfh2", loadYahyaWifiPackage());
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

/**
 * Updates the configurable support contact + vendor list for a "package"
 * template — these get substituted into the {{SUPPORT_LINKS_HTML}} /
 * {{VENDORS_HTML}} placeholders at fetch time (see package-files.ts),
 * rather than being hardcoded in the bundled portal files.
 */
export async function updatePackageTemplateBranding(
  templateId: string,
  branding: { supportWhatsapp: string; supportPhone: string; vendors: PackageVendor[] },
) {
  const session = await getSession();
  if (!session) return { error: "Not authenticated." };

  const db = getDb();
  const [existing] = await db
    .select({ id: captiveTemplates.id, orgId: captiveTemplates.orgId, templateType: captiveTemplates.templateType })
    .from(captiveTemplates)
    .where(eq(captiveTemplates.id, templateId))
    .limit(1);
  if (!existing || existing.orgId !== session.orgId) {
    return { error: "Modèle introuvable." };
  }
  if (existing.templateType !== "package") {
    return { error: "Ce modèle n'est pas un portail multi-fichiers." };
  }

  const vendors = branding.vendors.filter((v) => v.name.trim() && v.phone.trim());

  await db
    .update(captiveTemplates)
    .set({
      packageSupportWhatsapp: branding.supportWhatsapp.trim() || null,
      packageSupportPhone: branding.supportPhone.trim() || null,
      packageVendors: vendors,
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
    templateType: existing.templateType,
    packageFiles: existing.packageFiles,
    packageSupportWhatsapp: existing.packageSupportWhatsapp,
    packageSupportPhone: existing.packageSupportPhone,
    packageVendors: existing.packageVendors,
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

  // Unassign from every bridge instead of refusing to delete — a deleted
  // template's bridges just fall back to whichever template is marked
  // "Par défaut" (see the page's own copy), so there's nothing left over
  // that would actually break by clearing the reference. Forcing the
  // admin to hunt down and manually unassign every bridge first (often
  // not even visible from this page) was a dead end with no obvious way
  // to ever delete a duplicate that happened to be assigned.
  await db
    .update(bridges)
    .set({ captiveTemplateId: null })
    .where(eq(bridges.captiveTemplateId, templateId));

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

  const appUrl = getAppUrl();
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

    // The auto-setup (container-setup.ts) never names the hotspot profile
    // "${bridge.name}-profile" — it names it after whatever hotspot name
    // the admin chose during the wizard, attached to whichever bridge
    // interface name was chosen there (default HOTSPOT_BRIDGE_NAME,
    // persisted on the router row if renamed). Setting html-directory on
    // a profile name that was never created was silently swallowed
    // (.catch), so the real, live profile's html-directory never actually
    // changed — the files below got uploaded into a folder the hotspot
    // service never reads from, and the captive portal kept showing
    // whatever it already had. Resolve the real profile name from the
    // live hotspot server first.
    const liveBridgeName = router.hotspotBridgeName?.trim() || HOTSPOT_BRIDGE_NAME;
    const [hotspotServer] = await client
      .talk(["/ip/hotspot/print", `?interface=${liveBridgeName}`])
      .catch(() => []);
    if (!hotspotServer?.profile) {
      return {
        error:
          "Aucun serveur hotspot actif trouvé sur ce routeur — lancez d'abord l'auto-setup (Configuration routeur) avant d'assigner un modèle.",
      };
    }
    await client
      .talk(["/ip/hotspot/profile/set", `=numbers=${hotspotServer.profile}`, `=html-directory=${htmlDirectory}`])
      .catch(() => {});

    const result = await uploadCaptiveTemplatePackage(client, {
      files,
      htmlDirectory,
      fileBaseUrl,
      ssid,
      routerId: router.id,
    });

    // Automatise le walled-garden de paiement : l'admin n'a pas à
    // re-bootstrapper le routeur pour que le checkout soit joignable depuis le
    // portail. Best-effort (ne bloque pas l'installation du portail).
    try {
      await ensureWalledGarden(
        client,
        new URL(appUrl).host,
        await getOrgWalledGardenDisabledHosts(router.orgId),
      );
    } catch {
      // ignoré : le walled-garden reste ajustable au prochain bootstrap.
    }

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
