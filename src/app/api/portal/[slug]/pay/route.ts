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
import {
  getOrgGeniusCreds,
  createOrgPayment,
  listPawapayProviders,
  pickPawapayProvider,
} from "@/lib/payment-gateways/geniuspay-org";
import { getOrgDial } from "@/lib/portal/org-dial";
import { countryForIntlPhone } from "@/lib/intl/countries";
import { prewarmPortalVoucherProfile } from "@/lib/portal/fulfill";

// Routage des rails sur GeniusPay v3 (geniuspay.ci), vérifié le 2026-07-23 :
//  • "wave"                → rail direct pay.wave.com (fiable en captif)
//  • "orange_money"/"mtn_money" → payment_method="pawapay" + mmo_provider
//    (ORANGE_xxx / MTN_MOMO_xxx, résolu par pays via listPawapayProviders) :
//    l'agrégateur PawaPay aboutit correctement, contrairement à l'ancien
//    routage Paystack cassé de pay.genius.ci.
//  • tout le reste (moov, card, hosted, indisponible) → checkout hébergé
//    geniuspay.ci (payment_method omis), qui liste et route chaque moyen.
const OPERATOR_BY_METHOD: Record<string, "orange" | "mtn"> = {
  orange_money: "orange",
  mtn_money: "mtn",
};

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
  // Le pays est transmis explicitement à GeniusPay : ne pas laisser son
  // auto-détection deviner un mauvais pays à partir d'un numéro sans « + ».
  // Priorité au pays du NUMÉRO du client (sélecteur de pays du portail : un
  // client guinéen/camerounais paie avec son propre pays), repli sur celui de
  // l'org. Résolu AVANT le claim pour qu'une erreur DB ne laisse pas la
  // commande bloquée en payment_initiating.
  const phoneCountry = countryForIntlPhone(order.phone.replace(/[^0-9]/g, ""));
  const iso2 = phoneCountry?.iso2 ?? (await getOrgDial(org.id)).iso2;

  // Résolution du rail. wave → DIRECT (pay.wave.com). orange_money/mtn_money →
  // PawaPay avec le code opérateur du pays du client (indispo → checkout hébergé).
  // Reste → omis (checkout hébergé, liste tous les moyens).
  //
  // ⚠️ WAVE DOIT RESTER EN DIRECT. Tenté (v133) de le router par le checkout
  // hébergé pour bénéficier de la redirection success_url : ÉCHEC — le checkout
  // hébergé envoie Wave sur PAYSTACK (checkout.paystack.com) qui refuse la
  // transaction (« Cette transaction n'est pas valide »). Le direct pay.wave.com
  // marche. Le retour vers la page du code pour Wave passe donc par l'onglet du
  // portail qui sonde /portal/paid (fix v130), pas par une redirection GeniusPay.
  let paymentMethod: string | undefined;
  let mmoProvider: string | undefined;
  if (methodRaw === "wave") {
    paymentMethod = "wave";
  } else {
    const operator = OPERATOR_BY_METHOD[methodRaw];
    if (operator && iso2 && iso2 !== "XX") {
      const provider = pickPawapayProvider(await listPawapayProviders(creds, iso2), operator);
      if (provider) {
        paymentMethod = "pawapay";
        mmoProvider = provider;
      }
    }
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

  // Pré-provisionne le profil du forfait sur le routeur EN ARRIÈRE-PLAN pendant
  // que le client paie (~15-30 s) → à la fulfillment le profil existe déjà et la
  // création du ticket est rapide (évite ~4 s sur les routeurs pas
  // pré-provisionnés, ex. MAMBA WIFI). Best-effort, détaché (conteneur persistant).
  void prewarmPortalVoucherProfile(order.id);

  const base = appUrl();
  const payment = await createOrgPayment(creds, {
    amountFcfa: order.priceCents ?? 0,
    description: `Forfait ${order.packageName ?? "WiFi"} — WiFi`,
    customer: {
      phone: order.phone,
      ...(iso2 && iso2 !== "XX" ? { country: iso2 } : {}),
    },
    paymentMethod,
    mmoProvider,
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
