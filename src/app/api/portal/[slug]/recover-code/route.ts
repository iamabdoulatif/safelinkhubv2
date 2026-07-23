// Endpoint PUBLIC « J'ai déjà payé — retrouver mon code ». Un client dont le
// paiement mobile money s'est terminé sur le téléphone (navigateur jamais revenu
// afficher le code) saisit son numéro : on retrouve sa dernière commande, on
// confirme/honore si besoin, et on renvoie le code. Le code part de toute façon
// à ce numéro par SMS — le révéler à son propriétaire ne divulgue rien de plus.
// Rate-limité par IP. Aucune session.

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { organizations, portalOrders } from "@/lib/db/schema";
import { recoverLatestPortalCode } from "@/lib/portal/fulfill";
import { buildRouterLoginUrl } from "@/lib/portal/router-login-url";
import { corsJson, corsPreflight } from "@/lib/portal/cors";
import { getOrgDial } from "@/lib/portal/org-dial";
import { sanitizeClientDial, toInternational } from "@/lib/portal/otp";
import { enforcePublicSubmissionRateLimit } from "@/lib/public-rate-limit";

export function OPTIONS() {
  return corsPreflight();
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return corsJson({ error: "Corps JSON invalide." }, { status: 400 });
  }

  const limit = await enforcePublicSubmissionRateLimit("recover");
  if (!limit.allowed) {
    return corsJson({ error: limit.error }, { status: 429 });
  }

  const db = getDb();
  const [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, slug))
    .limit(1);
  if (!org) return corsJson({ error: "Organisation inconnue." }, { status: 404 });

  const { dialCode: orgDial } = await getOrgDial(org.id);
  const dialCode = sanitizeClientDial(body.dialCode, orgDial);
  const phone = toInternational(String(body.phone ?? ""), dialCode);
  if (phone.length < 8) return corsJson({ error: "Numéro invalide." }, { status: 400 });

  const recovered = await recoverLatestPortalCode(org.id, phone);
  if (!recovered.found) {
    return corsJson(
      { found: false, error: "Aucune commande trouvée pour ce numéro (dernières 24 h)." },
      { status: 404 },
    );
  }

  if (!recovered.ready) {
    return corsJson({
      found: true,
      ready: false,
      pendingPayment: recovered.pendingPayment,
    });
  }

  // Routeur cible pour l'auto-connexion.
  const [order] = await db
    .select({ routerId: portalOrders.routerId })
    .from(portalOrders)
    .where(eq(portalOrders.id, recovered.orderId))
    .limit(1);

  return corsJson({
    found: true,
    ready: true,
    code: recovered.code,
    orderId: recovered.orderId,
    packageName: recovered.packageName,
    smsSent: recovered.smsSent,
    loginUrl: order?.routerId ? await buildRouterLoginUrl(order.routerId) : null,
  });
}
