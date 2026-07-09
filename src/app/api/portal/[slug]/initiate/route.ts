// Endpoint PUBLIC appelé par le portail captif (JS de login.html, via le
// walled-garden) quand un client final achète un forfait. Identifie l'org par
// son slug, crée une commande `portal_orders` (pending) et ouvre un checkout
// GeniusPay sur le compte de l'org. Renvoie { orderId, checkoutUrl }.
// Aucune session : c'est le client final, pas l'admin. Runtime Node (crypto).
//
// Le portail poll ensuite /api/portal/<slug>/status?orderId=… jusqu'à ce que le
// paiement soit confirmé et l'accès créé (voir status/route.ts + fulfill.ts).

import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { organizations, packages, routers, portalOrders } from "@/lib/db/schema";
import { packageProfileName } from "@/lib/mikrotik/package-voucher-profile";
import { normalizeMac } from "@/lib/portal/fulfill";
import { normalizeMsisdn } from "@/lib/sms/wassoya";
import { getOrgGeniusCreds, createOrgPayment } from "@/lib/payment-gateways/geniuspay-org";

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "https://safelinkhub.io").replace(/\/+$/, "");
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
    return Response.json({ error: "Corps JSON invalide." }, { status: 400 });
  }

  const packageId = String(body.packageId ?? "").trim();
  const phoneRaw = String(body.phone ?? "").trim();
  const macRaw = String(body.mac ?? "").trim();
  const routerIdInput = String(body.routerId ?? "").trim();

  const phone = normalizeMsisdn(phoneRaw);
  const mac = normalizeMac(macRaw);
  if (!packageId) return Response.json({ error: "Forfait manquant." }, { status: 400 });
  if (phone.length < 8) return Response.json({ error: "Numéro invalide." }, { status: 400 });
  if (!mac) return Response.json({ error: "Appareil non identifié (MAC)." }, { status: 400 });

  const db = getDb();
  const [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, slug))
    .limit(1);
  if (!org) return Response.json({ error: "Organisation inconnue." }, { status: 404 });

  const creds = await getOrgGeniusCreds(org.id);
  if (!creds) {
    return Response.json({ error: "Paiement en ligne non configuré." }, { status: 400 });
  }

  const [pkg] = await db
    .select()
    .from(packages)
    .where(and(eq(packages.id, packageId), eq(packages.orgId, org.id)))
    .limit(1);
  if (!pkg || !pkg.active) {
    return Response.json({ error: "Forfait indisponible." }, { status: 404 });
  }

  const profileName = packageProfileName(pkg.durationValue, pkg.durationUnit);
  if (!profileName) {
    return Response.json({ error: "Forfait non provisionnable." }, { status: 400 });
  }

  // Routeur cible : fourni par le portail (injecté par routeur), sinon l'unique
  // routeur de l'org s'il n'y en a qu'un.
  let routerId = routerIdInput;
  if (routerId) {
    const [r] = await db
      .select({ id: routers.id })
      .from(routers)
      .where(and(eq(routers.id, routerId), eq(routers.orgId, org.id)))
      .limit(1);
    if (!r) return Response.json({ error: "Routeur inconnu." }, { status: 404 });
  } else {
    const orgRouters = await db
      .select({ id: routers.id })
      .from(routers)
      .where(eq(routers.orgId, org.id))
      .limit(2);
    if (orgRouters.length === 1) routerId = orgRouters[0].id;
    else return Response.json({ error: "Routeur non identifié." }, { status: 400 });
  }

  // Commande en attente AVANT le paiement (la référence GeniusPay y est ajoutée
  // ensuite ; le statut est vérifié server-to-server au polling).
  const [order] = await db
    .insert(portalOrders)
    .values({
      orgId: org.id,
      routerId,
      packageId: pkg.id,
      phone,
      mac,
      profileName,
      priceCents: pkg.priceCents,
      status: "pending",
    })
    .returning({ id: portalOrders.id });

  const base = appUrl();
  const payment = await createOrgPayment(creds, {
    amountFcfa: pkg.priceCents,
    description: `Forfait ${pkg.name} — WiFi`,
    customer: { phone },
    metadata: { orderId: order.id, slug, kind: "portal" },
    successUrl: `${base}/portal/paid?orderId=${order.id}`,
    errorUrl: `${base}/portal/paid?orderId=${order.id}&status=error`,
  });

  if (!payment.ok) {
    await db
      .update(portalOrders)
      .set({ status: "failed", failureReason: payment.error })
      .where(eq(portalOrders.id, order.id));
    return Response.json({ error: payment.error }, { status: 502 });
  }

  await db
    .update(portalOrders)
    .set({ paymentReference: payment.reference })
    .where(eq(portalOrders.id, order.id));

  return Response.json({ orderId: order.id, checkoutUrl: payment.paymentUrl });
}
