// Endpoint PUBLIC appelé par le portail captif (JS de login.html, via le
// walled-garden) quand un client final achète un forfait. Identifie l'org par
// son slug, EXIGE que le numéro ait été vérifié par OTP (voir otp/*), crée une
// commande `portal_orders` (pending) et ouvre un checkout GeniusPay sur le
// compte de l'org. Renvoie { orderId, checkoutUrl }.
// Aucune session : c'est le client final, pas l'admin. Runtime Node (crypto).
//
// Le portail poll ensuite /api/portal/<slug>/status?orderId=… jusqu'à ce que le
// paiement soit confirmé et l'accès créé (voir status/route.ts + fulfill.ts).

import { after } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { organizations, packages, routers, portalOrders, portalOtps } from "@/lib/db/schema";
import { packageProfileName } from "@/lib/mikrotik/package-voucher-profile";
import { normalizeMac } from "@/lib/portal/fulfill";
import { corsJson, corsPreflight } from "@/lib/portal/cors";
import { getOrgDial } from "@/lib/portal/org-dial";
import { toInternational, OTP_VERIFY_TTL_MS } from "@/lib/portal/otp";
import { getOrgGeniusCreds, createOrgPayment, ensureOrgWebhook } from "@/lib/payment-gateways/geniuspay-org";

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "https://safelinkhub.io").replace(/\/+$/, "");
}

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

  const packageId = String(body.packageId ?? "").trim();
  const macRaw = String(body.mac ?? "").trim();
  const routerIdInput = String(body.routerId ?? "").trim();
  // Rail de paiement : "wave" par défaut (redirection compatible portail
  // captif). Le client peut surcharger, mais on refuse tout ce qui sort de la
  // liste GeniusPay connue pour éviter une valeur bidon.
  const ALLOWED_METHODS = new Set(["wave", "orange_money", "mtn_money", "card", "paystack"]);
  const methodRaw = String(body.method ?? "").trim();
  const paymentMethod = ALLOWED_METHODS.has(methodRaw) ? methodRaw : "wave";

  const mac = normalizeMac(macRaw);
  if (!packageId) return corsJson({ error: "Forfait manquant." }, { status: 400 });
  if (!mac) return corsJson({ error: "Appareil non identifié (MAC)." }, { status: 400 });

  const db = getDb();
  const [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, slug))
    .limit(1);
  if (!org) return corsJson({ error: "Organisation inconnue." }, { status: 404 });

  // Numéro international reconstitué depuis l'indicatif de l'org (le portail
  // n'envoie que le numéro local saisi).
  const { dialCode } = await getOrgDial(org.id);
  const phone = toInternational(String(body.phone ?? ""), dialCode);
  if (phone.length < 8) return corsJson({ error: "Numéro invalide." }, { status: 400 });

  // Gate OTP : le numéro doit avoir été vérifié récemment (voir otp/verify).
  const [otp] = await db
    .select({ verifiedAt: portalOtps.verifiedAt })
    .from(portalOtps)
    .where(and(eq(portalOtps.orgId, org.id), eq(portalOtps.phone, phone)))
    .limit(1);
  if (!otp?.verifiedAt || Date.now() - otp.verifiedAt.getTime() > OTP_VERIFY_TTL_MS) {
    return corsJson({ error: "Numéro non vérifié." }, { status: 403 });
  }

  const creds = await getOrgGeniusCreds(org.id);
  if (!creds) {
    return corsJson({ error: "Paiement en ligne non configuré." }, { status: 400 });
  }

  // Auto-répare le webhook des orgs configurées avant cette fonctionnalité, sans
  // les faire re-sauver leurs clés. Après la réponse (best-effort, non bloquant),
  // et court-circuité en mémoire une fois confirmé → pas d'appel à chaque achat.
  after(() => ensureOrgWebhook(creds, org.id));

  const [pkg] = await db
    .select()
    .from(packages)
    .where(and(eq(packages.id, packageId), eq(packages.orgId, org.id)))
    .limit(1);
  if (!pkg || !pkg.active) {
    return corsJson({ error: "Forfait indisponible." }, { status: 404 });
  }

  const profileName = packageProfileName(pkg.durationValue, pkg.durationUnit);
  if (!profileName) {
    return corsJson({ error: "Forfait non provisionnable." }, { status: 400 });
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
    if (!r) return corsJson({ error: "Routeur inconnu." }, { status: 404 });
  } else {
    const orgRouters = await db
      .select({ id: routers.id })
      .from(routers)
      .where(eq(routers.orgId, org.id))
      .limit(2);
    if (orgRouters.length === 1) routerId = orgRouters[0].id;
    else return corsJson({ error: "Routeur non identifié." }, { status: 400 });
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
    paymentMethod,
    metadata: { orderId: order.id, slug, kind: "portal" },
    successUrl: `${base}/portal/paid?orderId=${order.id}&slug=${encodeURIComponent(slug)}`,
    errorUrl: `${base}/portal/paid?orderId=${order.id}&slug=${encodeURIComponent(slug)}&status=error`,
  });

  if (!payment.ok) {
    await db
      .update(portalOrders)
      .set({ status: "failed", failureReason: payment.error })
      .where(eq(portalOrders.id, order.id));
    return corsJson({ error: payment.error }, { status: 502 });
  }

  await db
    .update(portalOrders)
    .set({ paymentReference: payment.reference })
    .where(eq(portalOrders.id, order.id));

  return corsJson({ orderId: order.id, checkoutUrl: payment.paymentUrl });
}
