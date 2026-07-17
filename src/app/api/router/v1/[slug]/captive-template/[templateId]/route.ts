import { NextRequest } from "next/server";
import { and, asc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { organizations, captiveTemplates, packages, routers } from "@/lib/db/schema";
import {
  contentTypeForPath,
  renderPackageFile,
  type PackageFile,
  type PackageVendor,
} from "@/lib/captive-templates/package-files";
import { getOrgDial } from "@/lib/portal/org-dial";

/**
 * Fetched directly by the router itself (via /tool fetch, see
 * captive-template-upload.ts) — not by a logged-in browser — so this is
 * intentionally unauthenticated like the install scripts. Scoped to a
 * specific org (by slug) + template id, and only ever returns files that
 * are part of that template's own packageFiles list, so it can't be used
 * to read arbitrary paths off the server.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; templateId: string }> },
) {
  const { slug, templateId } = await params;
  const relativePath = request.nextUrl.searchParams.get("path");
  const ssid = request.nextUrl.searchParams.get("ssid") || "WiFi";
  const routerId = request.nextUrl.searchParams.get("routerId") || "";
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://safelinkhub.io").replace(/\/+$/, "");
  if (!relativePath) {
    return new Response("Missing path", { status: 400 });
  }

  const db = getDb();
  const [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, slug))
    .limit(1);
  if (!org) {
    return new Response("Unknown organization", { status: 404 });
  }
  // Pays où opère le routeur (déduit du compte fondateur de l'org) → préfixe
  // d'appel injecté au portail + reconstruction du numéro international à l'OTP.
  const { dialCode, iso2 } = await getOrgDial(org.id);

  const [template] = await db
    .select()
    .from(captiveTemplates)
    .where(eq(captiveTemplates.id, templateId))
    .limit(1);
  if (!template || template.orgId !== org.id || template.templateType !== "package") {
    return new Response("Template not found", { status: 404 });
  }

  const files = (template.packageFiles as PackageFile[] | null) ?? [];
  const file = files.find((f) => f.path === relativePath);
  if (!file) {
    return new Response("File not found", { status: 404 });
  }

  // Forfaits actifs du ROUTEUR courant, injectés dans {{PLANS_HTML}} /
  // {{PLANS_JSON}} / {{MIN_PLAN_PRICE}} — chaque MikroTik n'affiche que SES
  // forfaits, jamais ceux d'une autre zone WiFi de l'org. Stratégie stricte :
  // si ce routeur a ≥1 forfait rattaché (routerId=routerId), on n'affiche que
  // ceux-là ; sinon (org legacy jamais re-configurée) on retombe sur les
  // forfaits « globaux » (routerId=null). Un forfait null est adopté (routerId
  // renseigné) au prochain auto-setup du routeur — voir container-setup.ts.
  const planColumns = {
    id: packages.id,
    name: packages.name,
    priceCents: packages.priceCents,
    durationValue: packages.durationValue,
    durationUnit: packages.durationUnit,
  } as const;
  let plans = routerId
    ? await db
        .select(planColumns)
        .from(packages)
        .where(
          and(
            eq(packages.orgId, org.id),
            eq(packages.active, true),
            eq(packages.routerId, routerId),
          ),
        )
        .orderBy(asc(packages.priceCents))
    : [];
  if (plans.length === 0) {
    // Aucun forfait rattaché à ce routeur (ou routerId absent) → forfaits
    // legacy globaux de l'org.
    plans = await db
      .select(planColumns)
      .from(packages)
      .where(
        and(
          eq(packages.orgId, org.id),
          eq(packages.active, true),
          isNull(packages.routerId),
        ),
      )
      .orderBy(asc(packages.priceCents));
  }

  // Branding scopé au ROUTEUR (saisi dans l'auto-setup) prioritaire sur celui
  // du modèle, qui sert de repli champ par champ. Un routeur qui a défini ses
  // propres vendeurs / contact affiche les siens ; sinon on retombe sur le
  // modèle (compat : anciens routeurs sans branding propre).
  let routerBranding:
    | { portalSupportWhatsapp: string | null; portalSupportPhone: string | null; portalVendors: unknown }
    | undefined;
  if (routerId) {
    const [routerRow] = await db
      .select({
        portalSupportWhatsapp: routers.portalSupportWhatsapp,
        portalSupportPhone: routers.portalSupportPhone,
        portalVendors: routers.portalVendors,
        orgId: routers.orgId,
      })
      .from(routers)
      .where(eq(routers.id, routerId))
      .limit(1);
    if (routerRow && routerRow.orgId === org.id) routerBranding = routerRow;
  }
  const routerVendors = Array.isArray(routerBranding?.portalVendors)
    ? (routerBranding.portalVendors as PackageVendor[])
    : null;

  const body = renderPackageFile(file, {
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
    // Pays où opère le routeur (déduit du compte fondateur) → préfixe + OTP.
    countryIso2: iso2,
    dialCode,
  });
  return new Response(new Uint8Array(body), {
    status: 200,
    headers: {
      "Content-Type": contentTypeForPath(file.path),
      "Cache-Control": "no-store",
    },
  });
}
