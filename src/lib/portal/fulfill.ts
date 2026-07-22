// Honneur d'une commande du portail captif : appelé une fois le paiement
// confirmé (webhook GeniusPay par-org). Crée le user hotspot RÉEL lié au MAC du
// client sur le routeur, enregistre le code comme voucher (source de vérité /
// reporting), puis envoie le code par SMS. Idempotent : rejouable sans doublon.
// Module serveur uniquement.

import { and, eq, isNull, lt, ne, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { portalOrders, packages, routers, voucherRouters, vouchers } from "@/lib/db/schema";
import { connectToRouter } from "@/lib/mikrotik/router-sync";
import { sendOrgSms } from "@/lib/sms/send";
import { getOrgGeniusCreds, getOrgPaymentStatus } from "@/lib/payment-gateways/geniuspay-org";
import { voucherProfileForPackage } from "@/lib/mikrotik/package-voucher-profile";
import { ensureVoucherProfileOnRouter } from "@/lib/mikrotik/voucher-profile-provision";
import { shouldAttemptPortalSms } from "@/lib/portal/sms-delivery";

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
 * - Si déjà `fulfilled`, renvoie le code et rejoue le SMS s'il n'a pas été
 *   confirmé comme envoyé.
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
    const code = await codeForOrder(db, order.voucherId);
    if (!code) {
      return { ok: true, code: "", smsSent: false, alreadyFulfilled: true };
    }
    const smsSent = await trySendPortalSms(db, order, code);
    return { ok: true, code, smsSent, alreadyFulfilled: true };
  }

  // Verrou mono-flight : seule la requête qui bascule `paid → fulfilling`
  // poursuit. Les polls concurrents obtiennent 0 ligne et repartent (l'accès
  // sera prêt au prochain tick). En cas d'échec, on repasse à `paid` → réessai.
  // Un claim PÉRIMÉ (plus vieux que STALE_CLAIM_MS : crash / throw pendant
  // l'honneur) est aussi récupérable — sans quoi la commande resterait
  // bloquée en `fulfilling` pour toujours. La fenêtre est très au-dessus des
  // timeouts routeur (~30 s) pour ne pas doubler un honneur encore en cours.
  const STALE_CLAIM_MS = 3 * 60 * 1000;
  const claim = await db
    .update(portalOrders)
    .set({ status: "fulfilling", claimedAt: new Date() })
    .where(
      and(
        eq(portalOrders.id, order.id),
        or(
          eq(portalOrders.status, "paid"),
          and(
            eq(portalOrders.status, "fulfilling"),
            // isNull couvre les claims d'avant la colonne claimed_at.
            or(
              isNull(portalOrders.claimedAt),
              lt(portalOrders.claimedAt, new Date(Date.now() - STALE_CLAIM_MS)),
            ),
          ),
        ),
      ),
    )
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

  // Définition du profil, pour le CRÉER sur le routeur s'il n'y est pas encore
  // (forfait dont le profil n'a pas été provisionné à l'auto-setup, ex. durée
  // ajoutée après). Reconstruit depuis le forfait vendu ; null si le forfait a
  // été supprimé → on comptera sur un profil déjà présent.
  let voucherProfile = null as ReturnType<typeof voucherProfileForPackage>;
  if (order.packageId) {
    const [pkgRow] = await db
      .select({
        durationValue: packages.durationValue,
        durationUnit: packages.durationUnit,
        priceCents: packages.priceCents,
      })
      .from(packages)
      .where(eq(packages.id, order.packageId))
      .limit(1);
    if (pkgRow) {
      voucherProfile = voucherProfileForPackage(
        pkgRow.durationValue,
        pkgRow.durationUnit,
        pkgRow.priceCents,
      );
    }
  }

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
  // LOGIN PAR CODE : le user hotspot est nommé D'APRÈS le CODE (pas le MAC), avec
  // le code aussi en mot de passe → le client se connecte en saisissant le code
  // affiché/SMS (le profil autorise http-chap/http-pap, voir container-setup.ts).
  // On lie quand même le user au MAC du client (`mac-address`) pour empêcher le
  // partage du code sur un autre appareil ; le profil impose la durée du forfait.
  // Chaque achat = un code unique → un user distinct (pas de ré-utilisation).
  let createError: string | null = null;
  try {
    // Crée le profil sur le routeur s'il manque (idempotent, non destructif) —
    // sinon user/add échouerait avec « profile not found » pour les forfaits non
    // provisionnés à l'auto-setup.
    if (voucherProfile) await ensureVoucherProfileOnRouter(client, voucherProfile);
    await client.talk([
      "/ip/hotspot/user/add",
      `=name=${code}`,
      `=password=${code}`,
      `=profile=${profileName}`,
      `=mac-address=${mac}`,
    ]);
  } catch (e) {
    createError = `Échec de création sur le routeur : ${e instanceof Error ? e.message : "inconnue"}.`;
  } finally {
    client.close();
  }
  if (createError) return failClaim(createError);

  // Enregistre le voucher (source de vérité / reporting Ventes) puis marque la
  // commande honorée. Protégé : un throw ici (hiccup DB, collision unique
  // improbable) doit repasser la commande à `paid` (réessai) au lieu de la
  // laisser bloquée en `fulfilling`. Au réessai un NOUVEAU code est généré :
  // le user hotspot de ce run devient orphelin sur le routeur (bénin, non
  // vendu) — préférable à une commande payée jamais honorée.
  try {
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

    // Rattachement au routeur dans la table de liaison — PAS un doublon de
    // `vouchers.routerId`. C'est `voucher_routers` que lit le décompte partagé
    // (lib/vouchers/reconcile.ts) pour aller relire sur le routeur le
    // commentaire d'expiration, figer la 1ʳᵉ connexion en base et y inscrire la
    // date de début. `generateVouchers` (lots) posait bien ce lien ; cette
    // voie-ci — la vente au portail, le gros du volume — l'avait toujours omis,
    // si bien que la table était VIDE en prod et que le décompte ne traitait
    // jamais rien : aucun ticket vendu au portail n'obtenait son expiration en
    // base. Constaté au déploiement v82 (0 ligne pour 15 vouchers).
    if (voucher && order.routerId) {
      await db
        .insert(voucherRouters)
        .values({
          orgId: order.orgId,
          voucherId: voucher.id,
          routerId: order.routerId,
          profileName,
          status: "PROVISIONED" as const,
        })
        .onConflictDoNothing();
    }

    await db
      .update(portalOrders)
      .set({ status: "fulfilled", voucherId: voucher?.id ?? null, fulfilledAt: new Date(), failureReason: null })
      .where(eq(portalOrders.id, order.id));
  } catch (e) {
    return failClaim(
      `Échec d'enregistrement du voucher : ${e instanceof Error ? e.message : "erreur base"}.`,
    );
  }

  // Le ticket est déjà créé : un échec SMS ne doit pas faire échouer le
  // paiement. Le résultat et la prochaine tentative sont suivis en base.
  const smsSent = await trySendPortalSms(db, order, code);

  return { ok: true, code, smsSent };
}

/**
 * Réserve une tentative SMS, envoie le code, puis persiste le résultat.
 *
 * La réservation conditionnelle est importante : le polling du portail et le
 * cron peuvent arriver au même instant. Une seule des deux requêtes obtient la
 * fenêtre d'envoi ; un crash laisse `pending` et sera repris après une minute.
 */
async function trySendPortalSms(
  db: ReturnType<typeof getDb>,
  order: typeof portalOrders.$inferSelect,
  code: string,
): Promise<boolean> {
  if (
    !shouldAttemptPortalSms({
      status: order.smsStatus,
      lastAttemptAt: order.smsLastAttemptAt,
    })
  ) {
    return false;
  }

  const attemptedAt = new Date();
  const retryBefore = new Date(attemptedAt.getTime() - 60_000);
  const claim = await db
    .update(portalOrders)
    .set({
      smsStatus: "pending",
      smsError: null,
      smsLastAttemptAt: attemptedAt,
      smsAttempts: sql`${portalOrders.smsAttempts} + 1`,
    })
    .where(
      and(
        eq(portalOrders.id, order.id),
        ne(portalOrders.smsStatus, "sent"),
        or(
          isNull(portalOrders.smsLastAttemptAt),
          lt(portalOrders.smsLastAttemptAt, retryBefore),
        ),
      ),
    )
    .returning({ id: portalOrders.id });
  if (claim.length === 0) return false;

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
    ? `Forfait ${packageName} activé. Votre code WiFi : ${code}. Saisissez-le sur le portail WiFi pour vous connecter.`
    : `Forfait WiFi activé. Votre code WiFi : ${code}. Saisissez-le sur le portail WiFi pour vous connecter.`;

  let sms: Awaited<ReturnType<typeof sendOrgSms>>;
  try {
    sms = await sendOrgSms({ orgId: order.orgId, to: order.phone, content: message });
  } catch (e) {
    sms = { ok: false, error: e instanceof Error ? e.message : "Échec d'envoi SMS." };
  }

  await db
    .update(portalOrders)
    .set(
      sms.ok
        ? {
            smsStatus: "sent",
            smsMessageId: sms.messageId,
            smsError: null,
            smsSentAt: new Date(),
          }
        : {
            smsStatus: "failed",
            smsMessageId: null,
            smsError: sms.error.slice(0, 500),
          },
    )
    .where(eq(portalOrders.id, order.id));

  if (!sms.ok) {
    console.warn("[portal:sms] échec d'envoi, reprise planifiée", {
      orderId: order.id,
      error: sms.error,
    });
  }
  return sms.ok;
}

/**
 * Point d'entrée WEBHOOK : GeniusPay a notifié un événement pour `reference`.
 * On ne fait PAS confiance à la charge utile du webhook (les paiements portail
 * sont par-org, sans secret de signature partagé) : on retrouve la commande par
 * sa référence puis on RE-VÉRIFIE le statut auprès de GeniusPay avec les clés de
 * l'org (autorité) avant d'honorer. Un faux webhook ne peut donc rien débloquer.
 * Renvoie `found:false` si la référence n'appartient à aucune commande portail
 * (l'appelant enchaîne alors sur le traitement plateforme).
 */
export async function confirmAndFulfillPortalByReference(
  reference: string,
): Promise<{ found: boolean; fulfilled: boolean }> {
  const db = getDb();
  const [order] = await db
    .select()
    .from(portalOrders)
    .where(eq(portalOrders.paymentReference, reference))
    .limit(1);
  if (!order) return { found: false, fulfilled: false };
  if (order.status === "fulfilled") return { found: true, fulfilled: true };

  const creds = await getOrgGeniusCreds(order.orgId);
  if (!creds) return { found: true, fulfilled: false };

  const gp = await getOrgPaymentStatus(creds, reference);
  if (!gp.ok) return { found: true, fulfilled: false };

  if (gp.status === "failed") {
    await db
      .update(portalOrders)
      .set({ status: "failed", failureReason: "Paiement échoué ou annulé (webhook)." })
      .where(and(eq(portalOrders.id, order.id), eq(portalOrders.status, "pending")));
    return { found: true, fulfilled: false };
  }
  if (gp.status !== "completed") return { found: true, fulfilled: false };

  // Payé (confirmé par l'API de l'org) : bascule pending→paid puis honore.
  await db
    .update(portalOrders)
    .set({ status: "paid" })
    .where(and(eq(portalOrders.id, order.id), eq(portalOrders.status, "pending")));
  const result = await fulfillPortalOrder(order.id);
  return { found: true, fulfilled: result.ok };
}
