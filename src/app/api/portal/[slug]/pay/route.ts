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
import { createCinetpayCharge, getOrgCinetpayCreds } from "@/lib/payment-gateways/cinetpay";
import { preselectPaiementPro } from "@/lib/payment-gateways/paiementpro";
import { getOrgDial } from "@/lib/portal/org-dial";
import { countryForIntlPhone } from "@/lib/intl/countries";
import { prewarmPortalVoucherProfile } from "@/lib/portal/fulfill";
import { appendPortalTheme, portalThemeFromUnknown } from "@/lib/portal/theme";
import { openPaymentLaneForOrder } from "@/lib/portal/payment-lane-open";

// Routage des rails sur GeniusPay (geniuspay.ci) :
//  • "wave" → rail direct pay.wave.com (lien qr.pay.wave.com côté page).
//  • "orange_money" / "mtn_money" / "moov_money" → payment_method="paiementpro"
//    (passerelle PaiementPro activée sur le compte), opérateur PRÉSÉLECTIONNÉ
//    (lib/payment-gateways/paiementpro.ts). PawaPay abandonné ici le
//    13/10/2026 : « Your pawaPay account has not been configured to make
//    deposits » (DEPOSITS_NOT_ALLOWED) ; les rails directs orange_money /
//    moov_money répondaient « Your IP address is not allowed » (Paystack).
//  • tout le reste (card, hosted) → checkout hébergé geniuspay.ci.
const PAIEMENTPRO_METHODS = new Set(["orange_money", "mtn_money", "moov_money"]);

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
      paymentReference: portalOrders.paymentReference,
      priceCents: portalOrders.priceCents,
      phone: portalOrders.phone,
      mac: portalOrders.mac,
      routerId: portalOrders.routerId,
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

  // MTN/Moov en API DIRECTE CinetPay (PUSH/USSD cellulaire) quand l'org a des
  // clés CinetPay : la validation se fait sur le réseau mobile, SANS internet
  // côté client — là où PaiementPro (page/app) échoue sur le captif (voir
  // [[mtn-momo-captive-limit]]). Sans clés CinetPay, on garde GeniusPay ci-dessous.
  if (methodRaw === "mtn_money" || methodRaw === "moov_money") {
    const cinet = await getOrgCinetpayCreds(org.id);
    if (cinet) {
      const [cClaim] = await db
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
      if (!cClaim) {
        return corsJson({ error: "Cette commande est déjà en cours de paiement." }, { status: 409 });
      }
      void prewarmPortalVoucherProfile(order.id);
      const base = appUrl();
      // Référence ≤ 30 (contrainte CinetPay), unique, = payment_reference (clé de suivi).
      const merchantTxId = ("SLH" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7))
        .toUpperCase()
        .slice(0, 30);
      // URL de retour CinetPay : courte (≤ 120, contrainte API) et NON utilisée en
      // PUSH (pas de redirection) — la vraie navigation client est le checkoutUrl renvoyé.
      const cinetReturn = `${base}/portal/paid?orderId=${order.id}`;
      const charge = await createCinetpayCharge(cinet, {
        merchantTransactionId: merchantTxId,
        amountFcfa: order.priceCents ?? 0,
        method: methodRaw,
        phone: `+${order.phone.replace(/[^0-9]/g, "")}`,
        designation: `Forfait ${order.packageName ?? "WiFi"} — WiFi`,
        notifyUrl: `${base}/api/payments/cinetpay/webhook?org=${org.id}`,
        successUrl: cinetReturn,
        failedUrl: `${cinetReturn}&status=error`,
      });
      if (!charge.ok) {
        await db
          .update(portalOrders)
          .set({ status: "pending", claimedAt: null, failureReason: charge.error })
          .where(and(eq(portalOrders.id, order.id), eq(portalOrders.status, "payment_initiating")));
        return corsJson({ error: charge.error }, { status: 422 });
      }
      await db
        .update(portalOrders)
        .set({ paymentReference: merchantTxId, provider: "cinetpay", status: "pending", claimedAt: null, failureReason: null })
        .where(and(eq(portalOrders.id, order.id), eq(portalOrders.status, "payment_initiating")));
      // PUSH : aucune redirection — le client approuve l'USSD sur son téléphone
      // (cellulaire). On renvoie la page du code (qui sonde /status) comme
      // checkoutUrl pour que le portail y navigue, + push:true pour la consigne.
      const paidUrl = appendPortalTheme(
        `${base}/portal/paid?orderId=${order.id}&slug=${encodeURIComponent(slug)}`,
        theme,
      );
      return corsJson({ checkoutUrl: paidUrl, push: true });
    }
    // Pas de clés CinetPay → repli sur PaiementPro (GeniusPay) ci-dessous.
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
  if (methodRaw === "wave") paymentMethod = "wave";
  else if (PAIEMENTPRO_METHODS.has(methodRaw)) paymentMethod = "paiementpro";

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
  const paymentInput = {
    amountFcfa: order.priceCents ?? 0,
    description: `Forfait ${order.packageName ?? "WiFi"} — WiFi`,
    customer: {
      phone: order.phone,
      ...(iso2 && iso2 !== "XX" ? { country: iso2 } : {}),
    },
    paymentMethod,
    metadata: { orderId: order.id, slug, kind: "portal" },
    successUrl: appendPortalTheme(
      `${base}/portal/paid?orderId=${order.id}&slug=${encodeURIComponent(slug)}`,
      theme,
    ),
    errorUrl: appendPortalTheme(
      `${base}/portal/paid?orderId=${order.id}&slug=${encodeURIComponent(slug)}&status=error`,
      theme,
    ),
  };
  let payment = await createOrgPayment(creds, paymentInput);
  // Passerelle forcée refusée → repli sur le checkout HÉBERGÉ GeniusPay (le
  // client y choisit son opérateur). Wave reste en direct : son repli hébergé
  // part sur Paystack, cassé.
  if (!payment.ok && paymentMethod && paymentMethod !== "wave") {
    console.error(
      JSON.stringify({
        level: "warn",
        msg: "portal forced rail rejected, falling back to hosted checkout",
        orderId: order.id,
        method: methodRaw,
        error: payment.error,
      }),
    );
    payment = await createOrgPayment(creds, { ...paymentInput, paymentMethod: undefined });
  }
  if (!payment.ok) {
    await db
      .update(portalOrders)
      .set({ status: "pending", claimedAt: null, failureReason: payment.error })
      .where(and(eq(portalOrders.id, order.id), eq(portalOrders.status, "payment_initiating")));
    // 422, PAS 502 : Cloudflare remplace toute réponse 502 de l'origine par
    // sa page « error code: 502 » (texte brut) — le portail ne pouvait plus
    // lire le message et Safari affichait « The string did not match the
    // expected pattern ».
    return corsJson({ error: payment.error }, { status: 422 });
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

  // VOIE DE PAIEMENT (mini-navigateur captif) — voir payment-lane-open.ts.
  const { lane, smsSent } =
    body.captive === true
      ? await openPaymentLaneForOrder({ ...order, orgId: org.id, checkoutUrl: payment.paymentUrl })
      : { lane: false, smsSent: false };

  // PaiementPro : opérateur présélectionné → le client arrive directement sur
  // l'étape de paiement (sans rechoisir pays + opérateur).
  const checkoutUrl = await preselectPaiementPro(payment.paymentUrl, methodRaw, iso2);
  return corsJson({ checkoutUrl, lane, smsSent });
}
