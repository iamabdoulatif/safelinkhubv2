// Endpoint PUBLIC appelé par /portal/paid quand le client appuie sur « Recevoir
// par SMS » : envoie le code de la commande honorée à son numéro. À la demande
// (le code n'est plus envoyé automatiquement à l'honneur — économie de crédits ;
// le cron sert de filet si le navigateur ne revient jamais). Aucune session.

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { organizations, portalOrders } from "@/lib/db/schema";
import { sendPortalTicketSms } from "@/lib/portal/fulfill";
import { corsJson, corsPreflight } from "@/lib/portal/cors";

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

  const orderId = String(body.orderId ?? "").trim();
  if (!orderId) return corsJson({ error: "Commande manquante." }, { status: 400 });

  const db = getDb();
  const [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, slug))
    .limit(1);
  if (!org) return corsJson({ error: "Organisation inconnue." }, { status: 404 });

  // La commande doit appartenir à cette org (le code n'est pas révélé, seul son
  // envoi au numéro déjà enregistré sur la commande est déclenché).
  const [order] = await db
    .select({ id: portalOrders.id, orgId: portalOrders.orgId })
    .from(portalOrders)
    .where(eq(portalOrders.id, orderId))
    .limit(1);
  if (!order || order.orgId !== org.id) {
    return corsJson({ error: "Commande introuvable." }, { status: 404 });
  }

  const result = await sendPortalTicketSms(orderId);
  if (!result.ok) {
    return corsJson({ sent: false, error: result.error ?? "Envoi impossible." }, { status: 400 });
  }
  return corsJson({ sent: true });
}
