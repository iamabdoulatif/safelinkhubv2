// Enregistre/MET À JOUR la fiche client du portail (prénom, nom, email) à la
// première commande d'un numéro. Appelé par la page hébergée /portal/pay avant
// le choix du moyen de paiement. Le NUMÉRO n'est jamais pris du corps : il est
// lu sur la commande (portal_orders.phone) pour garantir que la fiche est liée
// au bon numéro, celui qui recevra le code. Aucune session : c'est le client
// final. Idempotent : une 2e soumission du même (org, numéro) met à jour.

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { organizations, portalCustomers, portalOrders } from "@/lib/db/schema";
import { corsJson, corsPreflight } from "@/lib/portal/cors";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

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
  const firstName = String(body.firstName ?? "").trim();
  const lastName = String(body.lastName ?? "").trim();
  const email = String(body.email ?? "").trim();
  if (!orderId) return corsJson({ error: "Commande manquante." }, { status: 400 });
  if (!firstName || !lastName) return corsJson({ error: "Nom et prénom requis." }, { status: 400 });
  if (!EMAIL_RE.test(email)) return corsJson({ error: "Email invalide." }, { status: 400 });

  const db = getDb();
  const [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, slug))
    .limit(1);
  if (!org) return corsJson({ error: "Organisation inconnue." }, { status: 404 });

  const [order] = await db
    .select({ orgId: portalOrders.orgId, phone: portalOrders.phone })
    .from(portalOrders)
    .where(eq(portalOrders.id, orderId))
    .limit(1);
  if (!order || order.orgId !== org.id) {
    return corsJson({ error: "Commande introuvable." }, { status: 404 });
  }

  await db
    .insert(portalCustomers)
    .values({ orgId: order.orgId, phone: order.phone, firstName, lastName, email })
    .onConflictDoUpdate({
      target: [portalCustomers.orgId, portalCustomers.phone],
      set: { firstName, lastName, email, updatedAt: new Date() },
    });

  return corsJson({ ok: true });
}
