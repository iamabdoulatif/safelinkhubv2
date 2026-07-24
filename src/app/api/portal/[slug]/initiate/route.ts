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
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { organizations, packages, routers, portalOrders, portalOtps } from "@/lib/db/schema";
import { packageProfileName } from "@/lib/mikrotik/package-voucher-profile";
import { normalizeMac } from "@/lib/portal/fulfill";
import { corsJson, corsPreflight } from "@/lib/portal/cors";
import { getOrgDial } from "@/lib/portal/org-dial";
import { sanitizeClientDial, toInternational } from "@/lib/portal/otp";
import { getOrgGeniusCreds, ensureOrgWebhook } from "@/lib/payment-gateways/geniuspay-org";

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

  // Numéro international reconstitué depuis l'indicatif choisi par le client
  // au portail (sélecteur de pays), repli sur celui de l'org.
  const { dialCode: orgDial } = await getOrgDial(org.id);
  const dialCode = sanitizeClientDial(body.dialCode, orgDial);
  const phone = toInternational(String(body.phone ?? ""), dialCode);
  if (phone.length < 8) return corsJson({ error: "Numéro invalide." }, { status: 400 });

  // Gate OTP : le numéro doit avoir été vérifié au moins une fois pour cette
  // org (mémorisation permanente — voir otp/send). Un numéro jamais vérifié
  // (nouveau téléphone) doit d'abord passer par le code.
  const [otp] = await db
    .select({ verifiedAt: portalOtps.verifiedAt })
    .from(portalOtps)
    .where(and(eq(portalOtps.orgId, org.id), eq(portalOtps.phone, phone)))
    .limit(1);
  if (!otp?.verifiedAt) {
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

  // ANTI-DOUBLE-DÉBIT. Si CE client (même numéro + même forfait + même appareil)
  // a déjà une commande récente en cours, on n'en crée PAS une seconde : un
  // paiement mobile money terminé sur le téléphone (navigateur jamais revenu
  // afficher le code) pousse sinon le client à « racheter » → il paie deux fois.
  // On réutilise donc la commande existante :
  //   • payée / en honneur / honorée, OU en attente AVEC une référence GeniusPay
  //     (un checkout a déjà été ouvert, peut-être déjà réglé) → page d'ÉTAT
  //     (/portal/paid) : le code s'affiche, on ne relance JAMAIS un 2ᵉ checkout.
  //   • en attente SANS référence (moyen de paiement jamais choisi) → on réutilise
  //     la même commande pour le choix du moyen (évite juste les lignes en double).
  // La clé inclut le NUMÉRO : acheter pour un AUTRE téléphone (numéro différent)
  // crée bien une commande distincte — cas « un ticket pour X, un pour Y ». Idem
  // pour un forfait différent (packageId) ou un autre appareil (mac).
  const REUSE_WINDOW_MS = 60 * 60 * 1000; // ~ durée de validité d'un checkout
  const [existing] = await db
    .select({
      id: portalOrders.id,
      status: portalOrders.status,
      paymentReference: portalOrders.paymentReference,
    })
    .from(portalOrders)
    .where(
      and(
        eq(portalOrders.orgId, org.id),
        eq(portalOrders.phone, phone),
        eq(portalOrders.packageId, pkg.id),
        eq(portalOrders.mac, mac),
        inArray(portalOrders.status, ["pending", "paid", "fulfilling", "fulfilled"]),
        gte(portalOrders.createdAt, new Date(Date.now() - REUSE_WINDOW_MS)),
      ),
    )
    .orderBy(desc(portalOrders.createdAt))
    .limit(1);
  if (existing) {
    const base = appUrl();
    const paidUrl = `${base}/portal/paid?orderId=${existing.id}&slug=${encodeURIComponent(slug)}`;
    const payUrl = `${base}/portal/pay?orderId=${existing.id}&slug=${encodeURIComponent(slug)}`;
    // Un paiement est déjà engagé dès que la commande n'est plus un simple
    // « pending » sans référence → on renvoie vers la page d'état (surtout pas un
    // nouveau checkout). Sinon, retour au choix du moyen sur la même commande.
    const paymentEngaged = existing.status !== "pending" || Boolean(existing.paymentReference);
    const target = paymentEngaged ? paidUrl : payUrl;
    return corsJson({ orderId: existing.id, payUrl: target, checkoutUrl: target, reused: true });
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
      smsStatus: "pending",
    })
    .returning({ id: portalOrders.id });

  // On NE crée PLUS le paiement ici : le CHOIX du moyen de paiement se fait sur
  // la page hébergée /portal/pay (safelinkhub.io, fiable derrière le portail
  // captif), qui appelle ensuite /pay avec le rail choisi. On renvoie donc juste
  // l'URL de cette page. `checkoutUrl` reste renvoyé (= payUrl) pour rester
  // compatible avec l'ancien script portail qui redirige dessus.
  const base = appUrl();
  const payUrl = `${base}/portal/pay?orderId=${order.id}&slug=${encodeURIComponent(slug)}`;
  return corsJson({ orderId: order.id, payUrl, checkoutUrl: payUrl });
}
