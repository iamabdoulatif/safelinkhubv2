// Endpoint appelé par la page hébergée /portal/pay (même origine safelinkhub.io)
// quand le client a CHOISI un moyen de paiement. Crée la transaction GeniusPay
// sur le compte de l'org avec ce rail précis et renvoie l'URL de checkout du
// rail (ex. pay.wave.com pour Wave). Séparé de /initiate pour que le CHOIX du
// moyen se fasse sur une page SafeLinkHub fiable (le checkout hébergé GeniusPay
// par défaut ne proposait qu'Orange USSD, injouable sur portail captif iOS).
// Aucune session : c'est le client final. La commande a déjà été créée +
// vérifiée par OTP côté /initiate ; ici on se contente de la faire payer.

import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { organizations, packages, portalOrders } from "@/lib/db/schema";
import { corsJson, corsPreflight } from "@/lib/portal/cors";
import { getOrgGeniusCreds, createOrgPayment } from "@/lib/payment-gateways/geniuspay-org";

// Le portail expose deux choix : "wave" = rail direct pay.wave.com (rapide,
// fiable en mini-navigateur captif) ; "hosted" = on OMET payment_method →
// GeniusPay renvoie sa page de checkout hébergée geniuspay.ci/checkout qui
// contient RÉELLEMENT tous les moyens (Wave, Orange Money, MTN MoMo, Moov Money,
// carte internationale/Stripe, carte locale/Paystack). NB : forcer un rail
// mobile money précis (orange_money/mtn_money/moov_money/card) via l'API retombe
// sur Wave tant qu'il n'est pas activé côté marchand — seule la page hébergée
// route correctement chaque opérateur choisi par le client. Le rail "paystack"
// (checkout.paystack.com) ne montre qu'un sous-ensemble (ni Moov, ni carte int.).
const ALLOWED_METHODS = new Set(["wave", "orange_money", "mtn_money", "moov_money", "card", "paystack"]);

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

  const orderId = String(body.orderId ?? "").trim();
  const methodRaw = String(body.method ?? "").trim();
  // "hosted" ⇒ payment_method omis (undefined) → page hébergée multi-opérateurs.
  const paymentMethod =
    methodRaw === "hosted" ? undefined : ALLOWED_METHODS.has(methodRaw) ? methodRaw : "wave";
  if (!orderId) return corsJson({ error: "Commande manquante." }, { status: 400 });

  const db = getDb();
  const [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, slug))
    .limit(1);
  if (!org) return corsJson({ error: "Organisation inconnue." }, { status: 404 });

  // Commande + nom du forfait (pour la description GeniusPay).
  const [order] = await db
    .select({
      id: portalOrders.id,
      orgId: portalOrders.orgId,
      status: portalOrders.status,
      paymentReference: portalOrders.paymentReference,
      priceCents: portalOrders.priceCents,
      phone: portalOrders.phone,
      packageName: packages.name,
    })
    .from(portalOrders)
    .leftJoin(packages, eq(packages.id, portalOrders.packageId))
    .where(eq(portalOrders.id, orderId))
    .limit(1);
  if (!order || order.orgId !== org.id) {
    return corsJson({ error: "Commande introuvable." }, { status: 404 });
  }
  if (order.status !== "pending" || order.paymentReference) {
    // Déjà en paiement / honorée : rien à recréer (évite les doublons de charge).
    return corsJson({ error: "Cette commande n'est plus payable." }, { status: 409 });
  }

  const creds = await getOrgGeniusCreds(org.id);
  if (!creds) {
    return corsJson({ error: "Paiement en ligne non configuré." }, { status: 400 });
  }

  const [claim] = await db
    .update(portalOrders)
    .set({ status: "payment_initiating", claimedAt: new Date(), failureReason: null })
    .where(
      and(
        eq(portalOrders.id, order.id),
        eq(portalOrders.orgId, org.id),
        eq(portalOrders.status, "pending"),
        isNull(portalOrders.paymentReference),
      ),
    )
    .returning({ id: portalOrders.id });
  if (!claim) {
    return corsJson({ error: "Cette commande est déjà en cours de paiement." }, { status: 409 });
  }

  const base = appUrl();
  const payment = await createOrgPayment(creds, {
    amountFcfa: order.priceCents ?? 0,
    description: `Forfait ${order.packageName ?? "WiFi"} — WiFi`,
    customer: { phone: order.phone },
    paymentMethod,
    metadata: { orderId: order.id, slug, kind: "portal" },
    successUrl: `${base}/portal/paid?orderId=${order.id}&slug=${encodeURIComponent(slug)}`,
    errorUrl: `${base}/portal/paid?orderId=${order.id}&slug=${encodeURIComponent(slug)}&status=error`,
  });
  if (!payment.ok) {
    await db
      .update(portalOrders)
      .set({ status: "pending", claimedAt: null, failureReason: payment.error })
      .where(and(eq(portalOrders.id, order.id), eq(portalOrders.status, "payment_initiating")));
    return corsJson({ error: payment.error }, { status: 502 });
  }

  const [updated] = await db
    .update(portalOrders)
    .set({
      paymentReference: payment.reference,
      status: "pending",
      claimedAt: null,
      failureReason: null,
    })
    .where(and(eq(portalOrders.id, order.id), eq(portalOrders.status, "payment_initiating")))
    .returning({ id: portalOrders.id });
  if (!updated) {
    console.error(
      JSON.stringify({
        level: "error",
        msg: "portal payment reference attach failed",
        route: "/api/portal/[slug]/pay",
        orderId: order.id,
        reference: payment.reference,
      }),
    );
    return corsJson({ error: "Paiement créé mais commande non mise à jour." }, { status: 500 });
  }

  return corsJson({ checkoutUrl: payment.paymentUrl });
}
