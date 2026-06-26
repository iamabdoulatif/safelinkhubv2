import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { organizations, captiveTemplates } from "@/lib/db/schema";
import {
  contentTypeForPath,
  renderPackageFile,
  type PackageFile,
  type PackageVendor,
} from "@/lib/captive-templates/package-files";

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

  const body = renderPackageFile(file, {
    ssid,
    supportWhatsapp: template.packageSupportWhatsapp,
    supportPhone: template.packageSupportPhone,
    vendors: template.packageVendors as PackageVendor[] | null,
  });
  return new Response(new Uint8Array(body), {
    status: 200,
    headers: {
      "Content-Type": contentTypeForPath(file.path),
      "Cache-Control": "no-store",
    },
  });
}
