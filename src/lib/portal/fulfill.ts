// Honneur d'une commande du portail captif : appelé une fois le paiement
// confirmé (webhook GeniusPay par-org). Crée le user hotspot RÉEL lié au MAC du
// client sur le routeur, enregistre le code comme voucher (source de vérité /
// reporting), puis envoie le code par SMS. Idempotent : rejouable sans doublon.
// Module serveur uniquement.

import { and, desc, eq, gte, isNull, lt, ne, or, sql } from "drizzle-orm";
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
 * - Si déjà `fulfilled`, renvoie le code (et n'envoie le SMS que si demandé).
 * - Échec routeur → la commande reste `paid` (rejouable par le webhook).
 * - Échec SMS → la commande est quand même `fulfilled` (l'accès est créé) et
 *   `smsSent:false` : le code reste récupérable sur le portail / au support.
 *
 * `opts.sendSms` (défaut false) : par défaut on CRÉE le code sans envoyer de
 * SMS — le client choisit sur /portal/paid (« Recevoir par SMS » / « Copier »),
 * ce qui économise les crédits SMS. L'envoi automatique est assuré comme FILET
 * par le cron de réconciliation si le navigateur ne revient jamais afficher le
 * code (paiement mobile money hors-navigateur).
 */
export async function fulfillPortalOrder(
  orderId: string,
  opts?: { sendSms?: boolean },
): Promise<FulfillResult> {
  const sendSms = opts?.sendSms ?? false;
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
    const smsSent = sendSms ? await trySendPortalSms(db, order, code) : order.smsStatus === "sent";
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

    // AUTO-LOGIN CÔTÉ ROUTEUR (best-effort) : ouvre immédiatement une session
    // hotspot active pour l'appareil, sans dépendre du navigateur. C'est ce qui
    // « connecte tout seul » le téléphone après l'achat — y compris quand le
    // paiement mobile money l'a fait basculer en 4G (la page /portal/paid ne
    // peut alors pas atteindre le routeur). On retrouve l'IP courante du client
    // dans la table des hôtes hotspot (par MAC) puis on force le login avec le
    // code. Un échec ici n'empêche JAMAIS l'accès : le code reste saisissable et
    // l'auto-login navigateur + le SMS restent en repli. Volontairement non-fatal.
    try {
      // Timeout COURT (2,5 s) : cet auto-login réseau est un bonus — il ne doit
      // JAMAIS retarder l'affichage du code. Sur un routeur lent / une commande
      // non supportée, on abandonne vite au lieu d'attendre le timeout de 8 s par
      // défaut (× 2 appels = jusqu'à 16 s ajoutés au « Activation en cours »).
      const hosts = await client.talk(["/ip/hotspot/host/print", `?mac-address=${mac}`], 2500);
      const ip =
        hosts.find((h) => (h["mac-address"] ?? "").toUpperCase() === mac)?.["address"] ??
        hosts[0]?.["address"];
      if (ip) {
        await client.talk(
          [
            "/ip/hotspot/active/login",
            `=user=${code}`,
            `=password=${code}`,
            `=ip=${ip}`,
            `=mac-address=${mac}`,
          ],
          2500,
        );
      }
    } catch {
      // Appareil absent de la table des hôtes (plus sur le WiFi) ou commande
      // refusée : on ignore — repli sur l'auto-login navigateur + SMS.
    }
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

  // Le ticket est créé. On n'envoie le SMS QUE si demandé (le client décide sur
  // /portal/paid) — sinon smsStatus reste `pending`, et le filet du cron
  // enverra le code si le navigateur ne l'affiche jamais. Un échec SMS ne fait
  // jamais échouer le paiement (l'accès existe déjà).
  const smsSent = sendSms ? await trySendPortalSms(db, order, code) : false;

  return { ok: true, code, smsSent };
}

/**
 * Envoie le code par SMS À LA DEMANDE (bouton « Recevoir par SMS » de
 * /portal/paid). Renvoie l'état d'envoi. Idempotent : si déjà envoyé, ne
 * redéclenche pas (trySendPortalSms ignore un `smsStatus="sent"`).
 */
export async function sendPortalTicketSms(
  orderId: string,
): Promise<{ ok: boolean; smsSent: boolean; error?: string }> {
  const db = getDb();
  const [order] = await db.select().from(portalOrders).where(eq(portalOrders.id, orderId)).limit(1);
  if (!order) return { ok: false, smsSent: false, error: "Commande introuvable." };
  if (order.status !== "fulfilled") return { ok: false, smsSent: false, error: "Commande non honorée." };
  const code = await codeForOrder(db, order.voucherId);
  if (!code) return { ok: false, smsSent: false, error: "Code introuvable." };
  if (order.smsStatus === "sent") return { ok: true, smsSent: true };
  const smsSent = await trySendPortalSms(db, order, code);
  return { ok: smsSent, smsSent };
}

/**
 * Marque la commande « code vu au navigateur » (smsStatus `held`) : le client
 * est présent sur /portal/paid, le filet SMS automatique ne doit donc PAS
 * partir (il choisira via le bouton). Ne touche que les commandes encore
 * `pending` (jamais un SMS déjà envoyé/échoué/tenu).
 */
export async function holdPortalTicketSms(orderId: string): Promise<void> {
  const db = getDb();
  await db
    .update(portalOrders)
    .set({ smsStatus: "held" })
    .where(and(eq(portalOrders.id, orderId), eq(portalOrders.smsStatus, "pending")));
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

export type RecoverCodeResult =
  | { found: false }
  | {
      found: true;
      ready: boolean; // true = code prêt ; false = paiement en cours / non abouti
      code: string;
      orderId: string;
      packageName: string | null;
      smsSent: boolean;
      pendingPayment: boolean; // true = un paiement est encore en attente de confirmation
    };

/**
 * « J'ai déjà payé — retrouver mon code » : retrouve la DERNIÈRE commande d'un
 * numéro (paiement mobile money terminé sur le téléphone, navigateur jamais
 * revenu). Confirme le paiement / honore si besoin, puis renvoie le code.
 * Le code est de toute façon délivré à ce même numéro par SMS : le révéler à
 * son propriétaire ne divulgue rien de plus.
 */
export async function recoverLatestPortalCode(
  orgId: string,
  phone: string,
  lookbackMs = 24 * 60 * 60 * 1000,
): Promise<RecoverCodeResult> {
  const db = getDb();
  const since = new Date(Date.now() - lookbackMs);
  const [order] = await db
    .select()
    .from(portalOrders)
    .where(
      and(
        eq(portalOrders.orgId, orgId),
        eq(portalOrders.phone, phone),
        gte(portalOrders.createdAt, since),
      ),
    )
    .orderBy(desc(portalOrders.createdAt))
    .limit(1);
  if (!order) return { found: false };

  const packageName = order.packageId
    ? (
        await db
          .select({ name: packages.name })
          .from(packages)
          .where(eq(packages.id, order.packageId))
          .limit(1)
      )[0]?.name ?? null
    : null;

  // Déjà honorée : renvoyer le code directement.
  if (order.status === "fulfilled") {
    const code = await codeForOrder(db, order.voucherId);
    return {
      found: true,
      ready: Boolean(code),
      code,
      orderId: order.id,
      packageName,
      smsSent: order.smsStatus === "sent",
      pendingPayment: false,
    };
  }

  // Encore `pending` avec une référence : re-vérifier le paiement et honorer.
  if (order.status === "pending" && order.paymentReference) {
    const confirmed = await confirmAndFulfillPortalByReference(order.paymentReference);
    if (confirmed.fulfilled) {
      const [fresh] = await db
        .select({ voucherId: portalOrders.voucherId, smsStatus: portalOrders.smsStatus })
        .from(portalOrders)
        .where(eq(portalOrders.id, order.id))
        .limit(1);
      const code = await codeForOrder(db, fresh?.voucherId ?? null);
      return {
        found: true,
        ready: Boolean(code),
        code,
        orderId: order.id,
        packageName,
        smsSent: fresh?.smsStatus === "sent",
        pendingPayment: false,
      };
    }
  }

  // paid | fulfilling : tenter l'honneur (routeur peut-être temporairement KO).
  if (order.status === "paid" || order.status === "fulfilling") {
    const result = await fulfillPortalOrder(order.id);
    if (result.ok) {
      return {
        found: true,
        ready: Boolean(result.code),
        code: result.code,
        orderId: order.id,
        packageName,
        smsSent: result.smsSent,
        pendingPayment: false,
      };
    }
  }

  // Commande trouvée mais paiement pas encore confirmé (ou échec transitoire).
  return {
    found: true,
    ready: false,
    code: "",
    orderId: order.id,
    packageName,
    smsSent: false,
    pendingPayment: order.status === "pending",
  };
}
