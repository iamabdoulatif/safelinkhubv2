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
import { reconcileWalledGardenOnce } from "@/lib/mikrotik/walled-garden";
import { getOrgWalledGardenDisabledHosts } from "@/lib/mikrotik/walled-garden-config";
import { ensureHotspotLoginByCode } from "@/lib/mikrotik/hotspot-login-mode";
import { persistRouterLoginHost } from "@/lib/portal/router-login-url";
import { getAppUrl } from "@/lib/net/app-url";
import { shouldAttemptPortalSms } from "@/lib/portal/sms-delivery";

import { randomAccessCode as randomCode } from "@/lib/access-code";

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
 * - Si déjà `fulfilled`, renvoie le code et confirme l'envoi SMS si nécessaire.
 * - Échec routeur → la commande reste `paid` (rejouable par le webhook).
 * - Échec SMS → la commande est quand même `fulfilled` (l'accès est créé) et
 *   `smsSent:false` : le code reste récupérable sur le portail / au support.
 *
 * `opts.sendSms` est activé par défaut : la livraison du code ne dépend pas du
 * retour du navigateur ni du timer de réconciliation. Le cron reste un filet
 * de reprise si le fournisseur SMS est temporairement indisponible.
 */
export async function fulfillPortalOrder(
  orderId: string,
  opts?: { sendSms?: boolean },
): Promise<FulfillResult> {
  const sendSms = opts?.sendSms ?? true;
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
  const tConnect0 = Date.now();
  try {
    client = await connectToRouter(router);
  } catch (e) {
    return failClaim(`Routeur injoignable : ${e instanceof Error ? e.message : "connexion échouée"}.`);
  }
  const connectMs = Date.now() - tConnect0;
  const tRouterWork0 = Date.now();
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
  // Chrono pour localiser la lenteur d'affichage du code (connexion tunnel vs
  // travail routeur). Lu dans les logs après un vrai achat.
  console.info("[portal:fulfill:timing]", {
    router: router.name,
    connectMs,
    routerWorkMs: Date.now() - tRouterWork0,
    ok: !createError,
  });
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

  // Le ticket est créé. Le SMS est envoyé immédiatement par défaut. Un échec
  // d'envoi ne fait jamais échouer le paiement (l'accès existe déjà) et le cron
  // le reprendra.
  // Auto-login réseau EN ARRIÈRE-PLAN (best-effort) : le code est déjà prêt —
  // on n'attend PAS l'ouverture de session hotspot pour l'afficher (c'était le
  // ~5 s de latence de trop). Le conteneur étant persistant, cette promesse
  // détachée va à son terme. L'auto-login navigateur + le SMS restent en repli.
  void activatePortalHotspotSession(router, mac, code);

  const smsSent = sendSms ? await trySendPortalSms(db, order, code) : false;

  return { ok: true, code, smsSent };
}

/**
 * PRÉPARE le routeur au paiement du portail, EN ARRIÈRE-PLAN — appelé au moment
 * du paiement (/pay), pendant que le client paie (~15-30 s). Réutilise UNE seule
 * connexion pour amener un routeur pas pré-provisionné (ex. MAMBA WIFI, jamais
 * passé par l'auto-setup complet, ≠ RUE-NICOLAS) à la parité RUE-NICOLAS sur les
 * trois états critiques du paiement :
 *
 *  1. WALLED-GARDEN — les hôtes des rails de paiement (Wave, GeniusPay, PawaPay…)
 *     doivent être joignables AVANT connexion, sinon la page de paiement reste
 *     bloquée. RUE-NICOLAS l'a reçu à l'auto-setup ; ailleurs ce n'était
 *     réconcilié qu'au health-check (cron quotidien). Ici on le pose au plus tôt,
 *     pendant que le client est encore sur la page de choix du moyen de paiement,
 *     donc AVANT sa redirection vers le rail.
 *  2. LOGIN PAR CODE — le profil hotspot actif doit accepter cookie+http-chap+
 *     http-pap, sinon le client doit RE-SAISIR le code (pas de session persistée).
 *  3. PROFIL VOUCHER du forfait — pré-créé pour que la fulfillment crée le ticket
 *     en ~300 ms au lieu de ~4 s (création profil + scheduler à la volée).
 *
 * Best-effort, idempotent, silencieux : chaque étape est indépendante (une qui
 * échoue n'empêche pas les autres) et sans effet si l'état est déjà bon. La
 * fulfillment et le health-check restent les filets.
 */
export async function prewarmPortalVoucherProfile(orderId: string): Promise<void> {
  try {
    const db = getDb();
    const [order] = await db
      .select({
        orgId: portalOrders.orgId,
        routerId: portalOrders.routerId,
        packageId: portalOrders.packageId,
      })
      .from(portalOrders)
      .where(eq(portalOrders.id, orderId))
      .limit(1);
    if (!order?.routerId) return;

    const [router] = await db
      .select()
      .from(routers)
      .where(and(eq(routers.id, order.routerId), eq(routers.orgId, order.orgId)))
      .limit(1);
    if (!router) return;

    // Profil voucher du forfait (si un forfait est rattaché) — reconstruit
    // depuis le forfait vendu ; null si le forfait a été supprimé.
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

    const client = await connectToRouter(router);
    try {
      // 1. Walled-garden — au plus une fois par (routeur, liste d'hôtes) et par
      // process (reconcileWalledGardenOnce est caché), donc pas rejoué à chaque
      // paiement une fois posé. getAppUrl peut lever (config locale en prod) :
      // toléré, on saute juste cette étape.
      try {
        await reconcileWalledGardenOnce(
          client,
          new URL(getAppUrl()).host,
          router.id,
          await getOrgWalledGardenDisabledHosts(order.orgId),
        );
      } catch {
        // best-effort : réconcilié au prochain health-check.
      }

      // 2. Login par code (cookie+http-chap+http-pap sur le profil hotspot actif),
      // + capture du host de login live pour activer l'AUTO-CONNEXION même si
      // l'instantané d'auto-setup en base est vide (ex. MAMBA WIFI).
      try {
        const { loginHost } = await ensureHotspotLoginByCode(client);
        await persistRouterLoginHost(router.id, loginHost);
      } catch {
        // best-effort : ne bloque pas la préparation.
      }

      // 3. Profil voucher du forfait.
      if (voucherProfile) {
        try {
          await ensureVoucherProfileOnRouter(client, voucherProfile);
        } catch {
          // best-effort : la fulfillment le crée au besoin (juste plus lent).
        }
      }
    } finally {
      client.close();
    }
  } catch {
    // best-effort : la fulfillment et le health-check rattrapent.
  }
}

/**
 * Ouvre une session hotspot ACTIVE pour l'appareil (auto-login réseau), en
 * ARRIÈRE-PLAN et best-effort — appelée après que le code a été renvoyé, pour ne
 * jamais retarder son affichage. Ouvre sa propre connexion, retrouve l'IP du
 * client par MAC dans la table des hôtes, puis force le login avec le code.
 * Silencieuse sur échec (appareil plus sur le WiFi, commande non supportée…).
 */
async function activatePortalHotspotSession(
  router: Parameters<typeof connectToRouter>[0],
  mac: string,
  code: string,
): Promise<void> {
  let client;
  try {
    client = await connectToRouter(router);
  } catch {
    return; // routeur injoignable → repli auto-login navigateur + SMS
  }
  try {
    // L'appareil qui vient de payer n'apparaît pas toujours IMMÉDIATEMENT dans la
    // table des hôtes hotspot (DHCP/ARP encore en cours, ou navigateur parti sur
    // le rail de paiement). On réessaie brièvement de retrouver son IP par MAC
    // avant d'abandonner — sans quoi l'auto-login réseau échoue en silence et le
    // client doit ressaisir le code. Repli inchangé (auto-login navigateur + SMS)
    // si l'appareil reste introuvable.
    let ip: string | undefined;
    for (let attempt = 0; attempt < 4 && !ip; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 1500));
      const hosts = await client
        .talk(["/ip/hotspot/host/print", `?mac-address=${mac}`], 2500)
        .catch(() => [] as Record<string, string>[]);
      ip =
        hosts.find((h) => (h["mac-address"] ?? "").toUpperCase() === mac)?.["address"] ??
        hosts[0]?.["address"];
    }
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
    // best-effort : on ignore
  } finally {
    client.close();
  }
}

/**
 * Réessaie l'envoi du code par SMS (bouton « Recevoir par SMS » de
 * /portal/paid). Idempotent : si déjà envoyé, ne redéclenche pas
 * (trySendPortalSms ignore un `smsStatus="sent"`).
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
 * Compatibilité avec les anciennes commandes : suspend un SMS de secours avant
 * la mise en place de l'envoi automatique. Les nouveaux parcours ne l'appellent
 * plus. Ne touche que les commandes encore `pending`.
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

/**
 * Accepte un événement GeniusPay DÉJÀ authentifié par le secret HMAC de
 * l'organisation. Contrairement au repli historique, il ne relit pas
 * `/payments/:reference` : GeniusPay peut livrer `payment.success` quelques
 * secondes avant que cet endpoint reflète `completed`, ce qui laissait le
 * portail captif en attente malgré un paiement réel.
 */
export async function confirmSignedPortalPaymentByReference(params: {
  orgId: string;
  reference: string;
  succeeded: boolean;
}): Promise<{ found: boolean; orderId?: string }> {
  const { orgId, reference, succeeded } = params;
  const db = getDb();
  const [order] = await db
    .select({ id: portalOrders.id, status: portalOrders.status })
    .from(portalOrders)
    .where(and(eq(portalOrders.orgId, orgId), eq(portalOrders.paymentReference, reference)))
    .limit(1);
  if (!order) return { found: false };

  if (succeeded) {
    await db
      .update(portalOrders)
      .set({ status: "paid", failureReason: null })
      .where(and(eq(portalOrders.id, order.id), eq(portalOrders.status, "pending")));
  } else {
    await db
      .update(portalOrders)
      .set({ status: "failed", failureReason: "Paiement échoué ou annulé." })
      .where(
        and(
          eq(portalOrders.id, order.id),
          or(eq(portalOrders.status, "pending"), eq(portalOrders.status, "payment_initiating")),
        ),
      );
  }

  return { found: true, orderId: order.id };
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
