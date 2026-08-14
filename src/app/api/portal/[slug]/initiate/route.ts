// Endpoint PUBLIC appelé par le portail captif (JS de login.html, via le
// walled-garden) quand un client final achète un forfait. Identifie l'org par
// son slug, EXIGE que le numéro ait été vérifié par OTP (voir otp/*), crée une
// commande `portal_orders` (pending) et ouvre un checkout GeniusPay sur le
// compte de l'org. Renvoie { orderId, checkoutUrl }.
// Aucune session : c'est le client final, pas l'admin. Runtime Node (crypto).
//
// Le portail poll ensuite /api/portal/<slug>/status?orderId=… jusqu'à ce que le
// paiement soit confirmé et l'accès créé (voir status/route.ts + fulfill.ts).

import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { organizations, packages, routers, portalOrders, portalOtps } from "@/lib/db/schema";
import { packageProfileName } from "@/lib/mikrotik/package-voucher-profile";
import { normalizeMac } from "@/lib/portal/fulfill";
import { corsJson, corsPreflight } from "@/lib/portal/cors";
import { getOrgDial } from "@/lib/portal/org-dial";
import { sanitizeClientDial, toInternational } from "@/lib/portal/otp";
import { appendPortalTheme, portalThemeFromUnknown } from "@/lib/portal/theme";
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
  const theme = portalThemeFromUnknown(body.theme);

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

  // Crée (une seule fois) le webhook SIGNÉ avant d'ouvrir le paiement. Il ne
  // faut pas le décaler après la réponse : un paiement Wave très rapide pouvait
  // réussir avant l'inscription du webhook et retomber sur le polling lent.
  // La fonction reste best-effort et le polling demeure le filet de secours.
  await ensureOrgWebhook(creds, org.id);

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

  // DOUBLES ACHATS AUTORISÉS (choix produit, 2026-07-24) : chaque « acheter » crée
  // une commande PAYABLE indépendante — aucune déduplication. Le client peut donc
  // racheter autant de tickets qu'il veut (même numéro, même appareil), au prix de
  // laisser passer un éventuel double débit s'il repaie une commande déjà réglée.
  // Les filets de récupération restent en place : /portal/recover (retrouver son
  // code par numéro), SMS automatique et cron de réconciliation.

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
  const payUrl = appendPortalTheme(
    `${base}/portal/pay?orderId=${order.id}&slug=${encodeURIComponent(slug)}`,
    theme,
  );
  return corsJson({ orderId: order.id, payUrl, checkoutUrl: payUrl });
}
