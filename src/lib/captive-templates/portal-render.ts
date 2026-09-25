import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { captiveTemplates, routers } from "@/lib/db/schema";
import { getPortalPlansForRouter } from "@/lib/portal/plans";
import { getOrgDial } from "@/lib/portal/org-dial";
import type { PackageBrandingVars, PackageVendor } from "./package-files";

type TemplateRow = typeof captiveTemplates.$inferSelect;

/**
 * Variables d'un portail « package » pour UN routeur — source unique partagée
 * par l'endpoint que télécharge le MikroTik et par l'aperçu de l'admin : ce
 * que l'admin voit est donc exactement ce que le routeur a reçu.
 */
export async function buildPortalVars(opts: {
  orgId: string;
  slug: string;
  template: TemplateRow;
  routerId: string;
  ssid: string;
}): Promise<PackageBrandingVars> {
  const { orgId, slug, template, routerId, ssid } = opts;
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://safelinkhub.io").replace(/\/+$/, "");
  // Pays où opère le routeur (déduit du compte fondateur de l'org) → préfixe
  // d'appel injecté au portail + reconstruction du numéro international à l'OTP.
  const { dialCode, iso2 } = await getOrgDial(orgId);

  // Forfaits du ROUTEUR (repli sur les forfaits globaux de l'org) — même source
  // que l'endpoint live /api/portal/[slug]/plans.
  const plans = await getPortalPlansForRouter(orgId, routerId || null);

  // Branding scopé au routeur (saisi dans l'auto-setup), prioritaire champ par
  // champ sur celui du modèle.
  let routerBranding:
    | { portalSupportWhatsapp: string | null; portalSupportPhone: string | null; portalVendors: unknown }
    | undefined;
  if (routerId) {
    const [row] = await getDb()
      .select({
        portalSupportWhatsapp: routers.portalSupportWhatsapp,
        portalSupportPhone: routers.portalSupportPhone,
        portalVendors: routers.portalVendors,
        orgId: routers.orgId,
      })
      .from(routers)
      .where(eq(routers.id, routerId))
      .limit(1);
    if (row && row.orgId === orgId) routerBranding = row;
  }
  const routerVendors = Array.isArray(routerBranding?.portalVendors)
    ? (routerBranding.portalVendors as PackageVendor[])
    : null;

  return {
    ssid,
    supportWhatsapp: routerBranding?.portalSupportWhatsapp || template.packageSupportWhatsapp,
    supportPhone: routerBranding?.portalSupportPhone || template.packageSupportPhone,
    vendors:
      routerVendors && routerVendors.length > 0
        ? routerVendors
        : (template.packageVendors as PackageVendor[] | null),
    plans,
    appUrl,
    slug,
    routerId,
    countryIso2: iso2,
    dialCode,
  };
}
