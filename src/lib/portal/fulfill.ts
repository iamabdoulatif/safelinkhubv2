// Honneur d'une commande du portail captif : appelé une fois le paiement
// confirmé (webhook GeniusPay par-org). Crée le user hotspot RÉEL lié au MAC du
// client sur le routeur, enregistre le code comme voucher (source de vérité /
// reporting), puis envoie le code par SMS. Idempotent : rejouable sans doublon.
// Module serveur uniquement.

import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { portalOrders, packages, routers, vouchers } from "@/lib/db/schema";
import { connectToRouter } from "@/lib/mikrotik/router-sync";
import { sendOrgSms } from "@/lib/sms/send";

const CODE_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";

function randomCode(length = 6): string {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

/** Retrouve le code (username du voucher) attribué à une commande honorée. */
async function codeForOrder(
  db: ReturnType<typeof getDb>,
  voucherId: string | null,
): Promise<string> {
  if (!voucherId) return "";
  const [v] = await db
    .select({ username: vouchers.username })
    .from(vouchers)
    .where(eq(vouchers.id, voucherId))
    .limit(1);
  return v?.username ?? "";
}

/** Normalise un MAC vers le format RouterOS AA:BB:CC:DD:EE:FF, ou "" si invalide. */
export function normalizeMac(raw: string): string {
  const hex = raw.replace(/[^0-9a-fA-F]/g, "").toUpperCase();
  if (hex.length !== 12) return "";
  return (hex.match(/.{2}/g) ?? []).join(":");
}

export type FulfillResult =
  | { ok: true; code: string; smsSent: boolean; alreadyFulfilled?: boolean }
  | { ok: false; error: string };

/**
 * Honore la commande `orderId`. Ne lève jamais : renvoie un résultat.
 * - Si déjà `fulfilled`, renvoie ok sans rien refaire.
 * - Échec routeur → la commande reste `paid` (rejouable par le webhook).
 * - Échec SMS → la commande est quand même `fulfilled` (l'accès est créé) et
 *   `smsSent:false` : le code reste récupérable sur le portail / au support.
 */
export async function fulfillPortalOrder(orderId: string): Promise<FulfillResult> {
  const db = getDb();

  const [order] = await db
    .select()
    .from(portalOrders)
    .where(eq(portalOrders.id, orderId))
    .limit(1);
  if (!order) return { ok: false, error: "Commande introuvable." };

  if (order.status === "fulfilled") {
    return { ok: true, code: await codeForOrder(db, order.voucherId), smsSent: false, alreadyFulfilled: true };
  }

  // Verrou mono-flight : seule la requête qui bascule `paid → fulfilling`
  // poursuit. Les polls concurrents obtiennent 0 ligne et repartent (l'accès
  // sera prêt au prochain tick). En cas d'échec, on repasse à `paid` → réessai.
  const claim = await db
    .update(portalOrders)
    .set({ status: "fulfilling" })
    .where(and(eq(portalOrders.id, order.id), eq(portalOrders.status, "paid")))
    .returning({ id: portalOrders.id });
  if (claim.length === 0) {
    return { ok: false, error: "Commande non payée ou déjà en cours de traitement." };
  }

  // Transitoire (routeur hors-ligne…) : repasse à `paid` → réessai au prochain poll.
  const failClaim = async (reason: string): Promise<FulfillResult> => {
    await db
      .update(portalOrders)
      .set({ status: "paid", failureReason: reason })
      .where(eq(portalOrders.id, order.id));
    return { ok: false, error: reason };
  };
  // Permanent (données invalides) : marque `failed`, pas de réessai.
  const permFail = async (reason: string): Promise<FulfillResult> => {
    await db
      .update(portalOrders)
      .set({ status: "failed", failureReason: reason })
      .where(eq(portalOrders.id, order.id));
    return { ok: false, error: reason };
  };

  const mac = normalizeMac(order.mac);
  if (!mac) return permFail("MAC client invalide.");

  const [router] = await db
    .select()
    .from(routers)
    .where(and(eq(routers.id, order.routerId), eq(routers.orgId, order.orgId)))
    .limit(1);
  if (!router) return permFail("Routeur introuvable.");

  const profileName = order.profileName;
  if (!profileName) return permFail("Profil hotspot manquant sur la commande.");

  // Code unique (username hotspot). vouchers.username est unique globalement.
  let code = randomCode();
  for (let i = 0; i < 5; i++) {
    const [clash] = await db
      .select({ id: vouchers.id })
      .from(vouchers)
      .where(eq(vouchers.username, code))
      .limit(1);
    if (!clash) break;
    code = randomCode();
  }

  // Crée le user hotspot lié au MAC. Réutilise le tunnel WireGuard du routeur.
  let client;
  try {
    client = await connectToRouter(router);
  } catch (e) {
    return failClaim(`Routeur injoignable : ${e instanceof Error ? e.message : "connexion échouée"}.`);
  }
  let createError: string | null = null;
  try {
    const exists = await client
      .talk(["/ip/hotspot/user/print", `?name=${code}`])
      .catch(() => []);
    if (exists.length === 0) {
      await client.talk([
        "/ip/hotspot/user/add",
        `=name=${code}`,
        `=password=${code}`,
        `=profile=${profileName}`,
        // Lie le code au MAC du client → anti-partage. Le mac-cookie du profil
        // hotspot auto-reconnecte ensuite ce MAC sans ressaisir le code.
        `=mac-address=${mac}`,
      ]);
    }
  } catch (e) {
    createError = `Échec de création sur le routeur : ${e instanceof Error ? e.message : "inconnue"}.`;
  } finally {
    client.close();
  }
  if (createError) return failClaim(createError);

  // Enregistre le voucher (source de vérité / reporting Ventes).
  const [voucher] = await db
    .insert(vouchers)
    .values({
      orgId: order.orgId,
      username: code,
      packageId: order.packageId,
      routerId: order.routerId,
      profileName,
      status: "PROVISIONED" as const,
      useCase: "Portal Sale",
      note: `Portail captif — ${order.phone}`,
    })
    .returning({ id: vouchers.id });

  await db
    .update(portalOrders)
    .set({ status: "fulfilled", voucherId: voucher?.id ?? null, fulfilledAt: new Date(), failureReason: null })
    .where(eq(portalOrders.id, order.id));

  // Récupère le nom du forfait pour un SMS lisible (best-effort).
  let packageName = "";
  if (order.packageId) {
    const [pkg] = await db
      .select({ name: packages.name })
      .from(packages)
      .where(eq(packages.id, order.packageId))
      .limit(1);
    packageName = pkg?.name ?? "";
  }

  const message = packageName
    ? `Votre code WiFi : ${code} (forfait ${packageName}). Reconnexion automatique ensuite.`
    : `Votre code WiFi : ${code}. Reconnexion automatique ensuite.`;

  const sms = await sendOrgSms({ orgId: order.orgId, to: order.phone, content: message });

  return { ok: true, code, smsSent: sms.ok };
}
