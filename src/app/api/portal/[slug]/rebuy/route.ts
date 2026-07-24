// Endpoint PUBLIC « Acheter un autre ticket ». Depuis /portal/paid (le client a
// déjà obtenu un code), il rachète en UN TAP un ticket pour un AUTRE téléphone,
// avec le MÊME numéro (déjà vérifié par OTP) : on CLONE la commande précédente
// (forfait, numéro, appareil, routeur) en une nouvelle commande `pending` et on
// renvoie l'URL de choix du moyen de paiement. Pas de re-saisie du numéro, pas
// d'OTP, pas de re-sélection du forfait. Aucune session : c'est le client final.
//
// On ne clone QUE depuis une VRAIE commande antérieure (paid/fulfilling/fulfilled)
// du même numéro : impossible de fabriquer une commande à partir de rien.

import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { organizations, packages, portalOrders, portalOtps } from "@/lib/db/schema";
import { packageProfileName } from "@/lib/mikrotik/package-voucher-profile";
import { corsJson, corsPreflight } from "@/lib/portal/cors";

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
  if (!orderId) return corsJson({ error: "Commande manquante." }, { status: 400 });

  const db = getDb();
  const [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, slug))
    .limit(1);
  if (!org) return corsJson({ error: "Organisation inconnue." }, { status: 404 });

  // Commande d'origine : doit appartenir à l'org ET être un vrai achat abouti
  // (payée/en honneur/honorée). On repart de son forfait/numéro/appareil/routeur.
  const [prev] = await db
    .select({
      status: portalOrders.status,
      packageId: portalOrders.packageId,
      phone: portalOrders.phone,
      mac: portalOrders.mac,
      routerId: portalOrders.routerId,
    })
    .from(portalOrders)
    .where(and(eq(portalOrders.id, orderId), eq(portalOrders.orgId, org.id)))
    .limit(1);
  if (!prev) return corsJson({ error: "Commande introuvable." }, { status: 404 });
  if (!["paid", "fulfilling", "fulfilled"].includes(prev.status)) {
    return corsJson({ error: "Rachat impossible : payez d'abord le ticket en cours." }, { status: 409 });
  }
  if (!prev.packageId) {
    return corsJson({ error: "Forfait introuvable." }, { status: 400 });
  }

  // Le numéro a déjà été vérifié par OTP (mémorisation permanente) — on revérifie
  // par sécurité (le rachat garde le même numéro que la commande d'origine).
  const [otp] = await db
    .select({ verifiedAt: portalOtps.verifiedAt })
    .from(portalOtps)
    .where(and(eq(portalOtps.orgId, org.id), eq(portalOtps.phone, prev.phone)))
    .limit(1);
  if (!otp?.verifiedAt) {
    return corsJson({ error: "Numéro non vérifié." }, { status: 403 });
  }

  // Forfait toujours actif ? (prix courant, comme /initiate.)
  const [pkg] = await db
    .select()
    .from(packages)
    .where(and(eq(packages.id, prev.packageId), eq(packages.orgId, org.id)))
    .limit(1);
  if (!pkg || !pkg.active) {
    return corsJson({ error: "Forfait indisponible." }, { status: 404 });
  }
  const profileName = packageProfileName(pkg.durationValue, pkg.durationUnit);
  if (!profileName) {
    return corsJson({ error: "Forfait non provisionnable." }, { status: 400 });
  }

  // Nouvelle commande en attente (paiement choisi ensuite sur /portal/pay). Elle
  // partage le même (numéro, appareil) que l'origine, mais c'est un ticket
  // DISTINCT et VOULU (l'origine est déjà honorée/payée) → pas un double-débit.
  const [order] = await db
    .insert(portalOrders)
    .values({
      orgId: org.id,
      routerId: prev.routerId,
      packageId: pkg.id,
      phone: prev.phone,
      mac: prev.mac,
      profileName,
      priceCents: pkg.priceCents,
      status: "pending",
      smsStatus: "pending",
    })
    .returning({ id: portalOrders.id });

  const base = appUrl();
  const payUrl = `${base}/portal/pay?orderId=${order.id}&slug=${encodeURIComponent(slug)}`;
  return corsJson({ orderId: order.id, payUrl, checkoutUrl: payUrl });
}
