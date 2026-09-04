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
import { isOrgSmsEnabled } from "@/lib/sms/send";

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
  /* `smsEnabled` voyage avec les forfaits parce que le portail appelle DÉJÀ cet
     endpoint au chargement : une info de plus, zéro requête de plus. Sans elle,
     la page promet un SMS avant de savoir s'il partira, et doit interroger le
     serveur au moment du clic — précisément l'appel qui échoue quand le
     walled-garden vacille. */
  const smsEnabled = await isOrgSmsEnabled(org.id).catch(() => true);
  return corsJson({ plans: portalPlanObjects(plans), smsEnabled });
}
