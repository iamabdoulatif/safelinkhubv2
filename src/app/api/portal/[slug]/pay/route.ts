// Endpoint appelé par la page hébergée /portal/pay (même origine safelinkhub.io)
// quand le client a CHOISI un moyen de paiement. Crée la transaction GeniusPay
// sur le compte de l'org avec ce rail précis et renvoie l'URL de checkout du
// rail (ex. pay.wave.com pour Wave). Séparé de /initiate pour que le CHOIX du
// moyen se fasse sur une page SafeLinkHub fiable (le checkout hébergé GeniusPay
// par défaut ne proposait qu'Orange USSD, injouable sur portail captif iOS).
// Aucune session : c'est le client final. La commande a déjà été créée +
// vérifiée par OTP côté /initiate ; ici on se contente de la faire payer.

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { organizations, packages, portalOrders } from "@/lib/db/schema";
import { corsJson, corsPreflight } from "@/lib/portal/cors";
import { appendPortalTheme, portalThemeFromUnknown } from "@/lib/portal/theme";
import { getOrgGeniusCreds, createOrgPayment } from "@/lib/payment-gateways/geniuspay-org";

// Rails GeniusPay connus (doc pay.genius.ci). "wave" par défaut (redirection
// compatible captif). "moov"/"card"/"paystack" restent possibles mais moins
// fiables derrière un portail captif (USSD ou 3-D Secure hors walled-garden).
const ALLOWED_METHODS = new Set(["wave", "orange_money", "mtn_money", "card", "paystack"]);

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
  const paymentMethod = ALLOWED_METHODS.has(methodRaw) ? methodRaw : "wave";
  // Présentation uniquement : ne participe à aucun contrôle de la commande.
  const theme = portalThemeFromUnknown(body.theme);
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
  if (order.status !== "pending") {
    // Déjà en paiement / honorée : rien à recréer (évite les doublons de charge).
    return corsJson({ error: "Cette commande n'est plus payable." }, { status: 409 });
  }

  const creds = await getOrgGeniusCreds(org.id);
  if (!creds) {
    return corsJson({ error: "Paiement en ligne non configuré." }, { status: 400 });
  }

  const base = appUrl();
  const payment = await createOrgPayment(creds, {
    amountFcfa: order.priceCents ?? 0,
    description: `Forfait ${order.packageName ?? "WiFi"} — WiFi`,
    customer: { phone: order.phone },
    paymentMethod,
    metadata: { orderId: order.id, slug, kind: "portal" },
    successUrl: appendPortalTheme(
      `${base}/portal/paid?orderId=${encodeURIComponent(order.id)}&slug=${encodeURIComponent(slug)}`,
      theme,
    ),
    errorUrl: appendPortalTheme(
      `${base}/portal/paid?orderId=${encodeURIComponent(order.id)}&slug=${encodeURIComponent(slug)}&status=error`,
      theme,
    ),
  });
  if (!payment.ok) {
    return corsJson({ error: payment.error }, { status: 502 });
  }

  await db
    .update(portalOrders)
    .set({ paymentReference: payment.reference })
    .where(eq(portalOrders.id, order.id));

  return corsJson({ checkoutUrl: payment.paymentUrl });
}
