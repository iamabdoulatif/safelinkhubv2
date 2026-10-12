// Ouvre la voie de paiement (payment-lane.ts) pour une commande Wave préparée
// (wave-prepare), au moment où le client touche la tuile Wave. Appelé en
// sendBeacon : la page part vers l'app Wave, la réponse n'est pas lue.
import { and, eq, gte, isNotNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { organizations, packages, portalOrders } from "@/lib/db/schema";
import { corsJson, corsPreflight } from "@/lib/portal/cors";
import { openPaymentLaneForOrder } from "@/lib/portal/payment-lane-open";
import { waveQrHref } from "@/lib/portal/browser-href";

export function OPTIONS() {
  return corsPreflight();
}

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const orderId = String(body.orderId ?? "").trim();
  const checkoutUrl = String(body.checkoutUrl ?? "").trim();
  // Le lien part par SMS au client : on n'accepte qu'un checkout Wave.
  if (!orderId || !waveQrHref(checkoutUrl)) {
    return corsJson({ error: "Requête invalide." }, { status: 400 });
  }

  const db = getDb();
  const [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, slug))
    .limit(1);
  if (!org) return corsJson({ error: "Organisation inconnue." }, { status: 404 });

  const [order] = await db
    .select({
      id: portalOrders.id,
      mac: portalOrders.mac,
      routerId: portalOrders.routerId,
      phone: portalOrders.phone,
      packageName: packages.name,
    })
    .from(portalOrders)
    .leftJoin(packages, eq(packages.id, portalOrders.packageId))
    .where(
      and(
        eq(portalOrders.id, orderId),
        eq(portalOrders.orgId, org.id),
        eq(portalOrders.status, "pending"),
        isNotNull(portalOrders.paymentReference),
        gte(portalOrders.createdAt, new Date(Date.now() - 60 * 60 * 1000)),
      ),
    )
    .limit(1);
  if (!order) return corsJson({ error: "Commande introuvable." }, { status: 404 });

  const res = await openPaymentLaneForOrder({ ...order, orgId: org.id, checkoutUrl });
  return corsJson(res);
}
