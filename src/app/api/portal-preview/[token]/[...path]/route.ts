import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { captiveTemplates, organizations, routers } from "@/lib/db/schema";
import { contentTypeForPath, renderPackageFile, type PackageFile } from "@/lib/captive-templates/package-files";
import { buildPortalVars } from "@/lib/captive-templates/portal-render";
import { simulateHotspotPage } from "@/lib/captive-templates/hotspot-vars";
import { verifyPreviewToken } from "@/lib/captive-templates/preview-token";

/**
 * Aperçu EXACT d'un portail tel que le routeur l'a reçu : mêmes fichiers, même
 * rendu (buildPortalVars), avec SSID/forfaits/branding de CE routeur. Le chemin
 * du fichier est dans l'URL pour que les liens relatifs du portail (css/,
 * img/) se résolvent tout seuls dans l'iframe.
 *
 * AUTORISATION : jeton signé dans l'URL (preview-token.ts), pas la session —
 * les sous-requêtes d'une iframe sandboxée partent sans cookie.
 *
 * SÉCURITÉ : un portail importé contient du JavaScript arbitraire. L'en-tête
 * CSP `sandbox` place chaque réponse dans une origine opaque, même ouverte
 * hors iframe : le script s'exécute, mais sans accès à la session de l'admin.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string; path: string[] }> },
) {
  const { token, path } = await params;
  const claims = verifyPreviewToken(token);
  if (!claims) return new Response("Aperçu expiré — rechargez la page.", { status: 403 });
  const relativePath = path.map(decodeURIComponent).join("/");

  const db = getDb();
  const [template] = await db.select().from(captiveTemplates).where(eq(captiveTemplates.id, claims.templateId)).limit(1);
  if (!template || template.orgId !== claims.orgId || template.templateType !== "package") {
    return new Response("Modèle introuvable", { status: 404 });
  }
  const file = ((template.packageFiles as PackageFile[] | null) ?? []).find((f) => f.path === relativePath);
  if (!file) return new Response("Fichier introuvable", { status: 404 });

  const [org] = await db
    .select({ slug: organizations.slug })
    .from(organizations)
    .where(eq(organizations.id, claims.orgId))
    .limit(1);
  if (!org) return new Response("Organisation introuvable", { status: 404 });

  const [router] = await db
    .select({ id: routers.id, orgId: routers.orgId, name: routers.name, config: routers.lastAutoSetupConfig })
    .from(routers)
    .where(eq(routers.id, claims.routerId))
    .limit(1);
  if (!router || router.orgId !== claims.orgId) return new Response("Routeur introuvable", { status: 404 });

  // SSID servi au portail à l'installation (même règle que l'auto-setup).
  const config = (router.config ?? {}) as { ssid?: string; hotspotName?: string };
  const ssid = config.ssid?.trim() || config.hotspotName?.trim() || router.name;

  const vars = await buildPortalVars({ orgId: claims.orgId, slug: org.slug, template, routerId: router.id, ssid });
  let body = new Uint8Array(renderPackageFile(file, vars));
  if (file.path.endsWith(".html")) {
    body = new TextEncoder().encode(simulateHotspotPage(new TextDecoder().decode(body), { identity: router.name }));
  }

  return new Response(body, {
    headers: {
      "Content-Type": contentTypeForPath(file.path),
      "Content-Security-Policy": "sandbox allow-scripts allow-forms",
      "X-Content-Type-Options": "nosniff",
      // Polices et scripts chargés depuis l'origine opaque de l'iframe : sans
      // CORS, le navigateur refuse les polices (icônes en carrés).
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "private, max-age=300",
    },
  });
}
