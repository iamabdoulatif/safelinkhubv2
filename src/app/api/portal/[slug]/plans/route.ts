// Endpoint PUBLIC des forfaits LIVE du portail captif. Fetché par login.html au
// chargement (script universel, renderInlinePlans) pour afficher des prix
// TOUJOURS À JOUR — sans ré-installer le portail après un changement de forfait.
// Le portail est servi par le ROUTEUR (origine ≠ safelinkhub.io) → CORS. Aucune
// session : c'est le client final, on ne renvoie que des données publiques déjà
// visibles sur le portail (nom du forfait + prix).

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { organizations } from "@/lib/db/schema";
import { corsJson, corsPreflight } from "@/lib/portal/cors";
import { getPortalPlansForRouter } from "@/lib/portal/plans";
import { portalPlanObjects } from "@/lib/captive-templates/package-files";

export function OPTIONS() {
  return corsPreflight();
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const routerId = new URL(request.url).searchParams.get("routerId")?.trim() || null;

  const db = getDb();
  const [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, slug))
    .limit(1);
  if (!org) return corsJson({ plans: [] }, { status: 404 });

  const plans = await getPortalPlansForRouter(org.id, routerId);
  return corsJson({ plans: portalPlanObjects(plans) });
}
