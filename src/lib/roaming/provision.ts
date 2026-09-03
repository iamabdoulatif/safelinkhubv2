// Création des comptes hotspot d'un groupe roaming — mécanique COMMUNE au lot
// de codes et au compte nominatif.
//
// Module « plain », sans "use server" : rien ici ne doit devenir un endpoint.
// L'organisation arrive de l'appelant, qui l'a lui-même dérivée de la session.
//
// POURQUOI CE MODULE EXISTE : générer 50 codes et créer le compte « aroune »
// sont la même opération à une chose près — la liste des identifiants. Tout le
// reste doit rester rigoureusement identique : mêmes options de profil, même
// levée des timeouts, même auto-login inter-zones, même règle du tout-ou-rien.
// Dupliquer cette séquence, c'est se garantir qu'un jour les comptes créés à la
// main se comporteront autrement que les tickets vendus.

import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  roamingGroupOffers,
  roamingGroupRouters,
  roamingGroups,
  roamingDeviceBindingRouters,
  roamingDeviceBindings,
  roamingProfiles,
  routers,
  voucherRouters,
  vouchers,
} from "@/lib/db/schema";
import { connectToRouter } from "@/lib/mikrotik/router-sync";
import type { RouterOSClient } from "@/lib/mikrotik/client";
import {
  packageProfileName,
  voucherProfileForPackage,
} from "@/lib/mikrotik/package-voucher-profile";
import { ensureVoucherProfileOnRouter } from "@/lib/mikrotik/voucher-profile-provision";
import { ensureMacAutoLogin } from "@/lib/mikrotik/hotspot-login-mode";
import { getAppUrl } from "@/lib/net/app-url";
import { roamingRouterProfileName } from "./forms";
import { effectiveRoamingPrice } from "./pricing";
import { newRoamingRouterIds } from "./forms";
import { appendRoamingSeenHook } from "./on-login-hook";
import { deriveRouterKey } from "./webhook-secret";
import { revokeRoamingTargets } from "./revocation";
import { findHotspotUser, purgeHotspotAccount } from "./hotspot-user";
import {
  clearRoamingDeviceBinding,
  resyncRoamingDeviceBinding,
  syncRoamingDeviceBinding,
} from "./mac-propagate";

/**
 * Un compte à créer. `password` est distinct de `username` pour les comptes
 * nominatifs ; sur un ticket vendu les deux valent le code.
 */
export type RoamingCredential = { username: string; password: string };

export type ProvisionResult = { error: string } | { success: true; created: number };

type ExtendRoamingGroupResult =
  | { error: string }
  | { success: true; added: number; synchronizedAccounts: number };

/** useCase des comptes nominatifs — les distingue des tickets vendus. */
export const NAMED_USER_CASE = "Roaming Named User";

/**
 * Charge l'offre d'un groupe et en dérive le profil RouterOS correspondant.
 * Partagé par la création et la modification : le profil d'un compte modifié
 * doit être exactement celui qu'aurait reçu un compte créé aujourd'hui.
 */
async function loadOffer(orgId: string, groupId: string, offerId: string) {
  const db = getDb();
  const [offer] = await db
    .select({
      priceOverrideCents: roamingGroupOffers.priceOverrideCents,
      profileId: roamingProfiles.id,
      durationValue: roamingProfiles.durationValue,
      durationUnit: roamingProfiles.durationUnit,
      uploadMbps: roamingProfiles.uploadMbps,
      downloadMbps: roamingProfiles.downloadMbps,
      defaultPriceCents: roamingProfiles.defaultPriceCents,
      active: roamingGroupOffers.active,
      profileActive: roamingProfiles.active,
    })
    .from(roamingGroupOffers)
    .innerJoin(roamingProfiles, eq(roamingGroupOffers.profileId, roamingProfiles.id))
    .where(
      and(
        eq(roamingGroupOffers.id, offerId),
        eq(roamingGroupOffers.groupId, groupId),
        eq(roamingGroupOffers.orgId, orgId),
      ),
    )
    .limit(1);
  if (!offer || !offer.active || !offer.profileActive) return null;

  const baseProfileName = packageProfileName(offer.durationValue, offer.durationUnit);
  const profileName = baseProfileName ? roamingRouterProfileName(groupId, baseProfileName) : null;
  const voucherProfile = voucherProfileForPackage(
    offer.durationValue,
    offer.durationUnit,
    effectiveRoamingPrice(offer.defaultPriceCents, offer.priceOverrideCents),
    { name: profileName ?? undefined, uploadMbps: offer.uploadMbps, downloadMbps: offer.downloadMbps },
  );
  if (!profileName || !voucherProfile) return null;
  return { offer, profileName, voucherProfile };
}

/** Zones d'un groupe roaming, bornées à l'organisation. */
async function loadGroupRouters(orgId: string, groupId: string) {
  const db = getDb();
  return db
    .select({ router: routers })
    .from(roamingGroupRouters)
    .innerJoin(routers, eq(roamingGroupRouters.routerId, routers.id))
    .where(
      and(
        eq(roamingGroupRouters.groupId, groupId),
        eq(roamingGroupRouters.orgId, orgId),
        eq(routers.orgId, orgId),
      ),
    );
}

/**
 * Ajoute des zones à un groupe SANS créer un groupe incohérent : les comptes
 * déjà présents sont d'abord copiés sur chaque nouvelle zone, puis seulement
 * ensuite les liens en base sont écrits. Le mot de passe n'est jamais gardé
 * par SafeLinkHub ; il est relu sur une zone déjà membre, le temps de cette
 * synchronisation unique.
 */
export async function extendRoamingGroup(opts: {
  orgId: string;
  groupId: string;
  routerIds: string[];
}): Promise<ExtendRoamingGroupResult> {
  const { orgId, groupId } = opts;
  const requestedRouterIds = [...new Set(opts.routerIds.map((id) => id.trim()).filter(Boolean))];
  if (requestedRouterIds.length === 0) return { error: "Sélectionnez au moins une nouvelle zone." };

  const db = getDb();
  const [group] = await db
    .select({ id: roamingGroups.id })
    .from(roamingGroups)
    .where(and(eq(roamingGroups.id, groupId), eq(roamingGroups.orgId, orgId)))
    .limit(1);
  if (!group) return { error: "Ce groupe roaming est introuvable." };

  const [currentMembers, candidates] = await Promise.all([
    loadGroupRouters(orgId, groupId),
    db
      .select()
      .from(routers)
      .where(and(eq(routers.orgId, orgId), inArray(routers.id, requestedRouterIds))),
  ]);
  if (candidates.length !== requestedRouterIds.length) {
    return { error: "Une zone sélectionnée ne fait pas partie de votre organisation." };
  }
  const currentIds = new Set(currentMembers.map(({ router }) => router.id));
  const additionIds = new Set(newRoamingRouterIds([...currentIds], requestedRouterIds));
  const additions = candidates.filter((router) => additionIds.has(router.id));
  if (additions.length === 0) return { error: "Ces zones couvrent déjà ce groupe." };

  const accounts = await db
    .select({
      id: vouchers.id,
      username: vouchers.username,
      profileName: vouchers.profileName,
      profileId: vouchers.roamingProfileId,
      durationValue: roamingProfiles.durationValue,
      durationUnit: roamingProfiles.durationUnit,
      uploadMbps: roamingProfiles.uploadMbps,
      downloadMbps: roamingProfiles.downloadMbps,
      defaultPriceCents: roamingProfiles.defaultPriceCents,
      priceOverrideCents: roamingGroupOffers.priceOverrideCents,
    })
    .from(vouchers)
    .leftJoin(roamingProfiles, eq(vouchers.roamingProfileId, roamingProfiles.id))
    .leftJoin(
      roamingGroupOffers,
      and(
        eq(roamingGroupOffers.groupId, groupId),
        eq(roamingGroupOffers.profileId, vouchers.roamingProfileId),
        eq(roamingGroupOffers.orgId, orgId),
      ),
    )
    .where(
      and(
        eq(vouchers.orgId, orgId),
        eq(vouchers.roamingGroupId, groupId),
        isNull(vouchers.deletedAt),
      ),
    );

  const profilesByName = new Map<string, NonNullable<ReturnType<typeof voucherProfileForPackage>>>();
  for (const account of accounts) {
    if (
      !account.profileName ||
      !account.profileId ||
      account.durationValue === null ||
      account.durationUnit === null ||
      account.uploadMbps === null ||
      account.downloadMbps === null ||
      account.defaultPriceCents === null
    ) {
      return { error: `Le compte « ${account.username} » n'a pas de profil roaming réutilisable.` };
    }
    const profile = voucherProfileForPackage(
      account.durationValue,
      account.durationUnit,
      effectiveRoamingPrice(account.defaultPriceCents, account.priceOverrideCents),
      {
        name: account.profileName,
        uploadMbps: account.uploadMbps,
        downloadMbps: account.downloadMbps,
      },
    );
    if (!profile) return { error: `Le profil du compte « ${account.username} » est invalide.` };
    profilesByName.set(account.profileName, profile);
  }

  const targets: { router: (typeof candidates)[number]; client: RouterOSClient }[] = [];
  const sources: { router: (typeof currentMembers)[number]["router"]; client: RouterOSClient }[] = [];
  const addedUsers: { client: RouterOSClient; username: string }[] = [];
  const closeAll = () => {
    for (const { client } of [...targets, ...sources]) client.close();
  };
  const cleanupAddedUsers = async () => {
    await Promise.all(
      addedUsers.map(async ({ client, username }) => {
        const user = await findHotspotUser(client, username);
        if (user?.[".id"]) await client.talk(["/ip/hotspot/user/remove", `=.id=${user[".id"]}`]).catch(() => {});
      }),
    );
  };

  try {
    for (const router of additions) {
      targets.push({ router, client: await connectToRouter(router) });
    }
    // Un groupe vide n'a rien à recopier. Le premier ticket préparera son
    // profil comme d'habitude via provisionRoamingAccounts.
    if (accounts.length === 0) {
      await db.insert(roamingGroupRouters).values(
        additions.map((router) => ({ orgId, groupId, routerId: router.id })),
      );
      return { success: true, added: additions.length, synchronizedAccounts: 0 };
    }

    for (const { router } of currentMembers) {
      try {
        sources.push({ router, client: await connectToRouter(router) });
      } catch {
        // Une autre zone joignable peut rester une source complète.
      }
    }
    if (sources.length === 0) {
      return { error: "Aucune zone actuelle ne répond : impossible de recopier les comptes sans leur mot de passe." };
    }

    const sourceUsers = new Map<string, Record<string, string>>();
    for (const account of accounts) {
      for (const { client } of sources) {
        const user = await findHotspotUser(client, account.username);
        if (user?.password) {
          sourceUsers.set(account.username, user);
          break;
        }
      }
      if (!sourceUsers.has(account.username)) {
        return { error: `« ${account.username} » est absent des zones joignables ; la nouvelle zone n'a pas été ajoutée.` };
      }
    }

    // Toutes les collisions sont détectées AVANT la première écriture : on ne
    // transforme jamais un utilisateur local inconnu en compte roaming.
    for (const { client } of targets) {
      for (const account of accounts) {
        if (await findHotspotUser(client, account.username)) {
          return { error: `« ${account.username} » existe déjà sur la nouvelle zone ; aucune modification n'a été faite.` };
        }
      }
    }

    for (const { router, client } of targets) {
      for (const profile of profilesByName.values()) {
        await prepareProfileOnRouter(client, router.id, profile);
      }
    }
    for (const { client } of targets) {
      for (const account of accounts) {
        const source = sourceUsers.get(account.username)!;
        await client.talk([
          "/ip/hotspot/user/add",
          `=name=${account.username}`,
          `=password=${source.password}`,
          `=profile=${account.profileName}`,
          `=comment=${source.comment ?? ""}`,
        ]);
        addedUsers.push({ client, username: account.username });
      }
    }

    await db.transaction(async (tx) => {
      await tx.insert(roamingGroupRouters).values(
        additions.map((router) => ({ orgId, groupId, routerId: router.id })),
      );
      await tx.insert(voucherRouters).values(
        accounts.flatMap((account) =>
          additions.map((router) => ({
            orgId,
            voucherId: account.id,
            routerId: router.id,
            profileName: account.profileName,
            status: "PROVISIONED" as const,
          })),
        ),
      );
    });

    // Un compte déjà utilisé possède une MAC canonique : après avoir copié son
    // code, on pose immédiatement son compagnon MAC sur les nouvelles zones.
    // Les erreurs restent visibles dans l'état PENDING/ERROR et la reprise
    // automatique les rejouera ; l'ajout de zone ne perd pas pour autant les
    // comptes déjà provisionnés avec succès.
    const bindings = await db
      .select({ id: roamingDeviceBindings.id })
      .from(roamingDeviceBindings)
      .where(inArray(roamingDeviceBindings.voucherId, accounts.map((account) => account.id)));
    if (bindings.length > 0) {
      await db
        .insert(roamingDeviceBindingRouters)
        .values(
          bindings.flatMap((binding) =>
            additions.map((router) => ({ bindingId: binding.id, routerId: router.id, status: "PENDING" as const })),
          ),
        )
        .onConflictDoNothing();
      for (const binding of bindings) {
        for (const { router, client } of targets) {
          await syncRoamingDeviceBinding({
            bindingId: binding.id,
            onlyRouterId: router.id,
            currentRouterClient: client,
          });
        }
      }
    }
    return { success: true, added: additions.length, synchronizedAccounts: accounts.length };
  } catch (error) {
    await cleanupAddedUsers();
    return {
      error: `Ajout annulé : ${error instanceof Error ? error.message : "une nouvelle zone a refusé la synchronisation"}`,
    };
  } finally {
    closeAll();
  }
}

/**
 * Pose le profil roaming sur une zone : création du profil, levée des timeouts,
 * auto-login inter-zones. Idempotent.
 *
 * ROAMING : un compte doit rester connecté LONGTEMPS entre zones. Par défaut le
 * profil hérite d'un keepalive-timeout court (2m) → la session « lâche » après
 * quelques minutes (téléphone en veille). On lève donc les timeouts ; la
 * validité reste bornée par l'expiration via le scheduler — sauf profil
 * illimité, qui n'en a pas.
 *
 * AUTO-LOGIN INTER-ZONES (1 appareil / compte) :
 *  • shared-users=1 → anti-partage (le compte se lie au 1er MAC vu) ;
 *  • on-login étendu → à chaque connexion, le routeur signale (code, MAC) au
 *    SaaS (/api/roaming/seen) qui lie ce MAC au compte sur les zones sœurs, où
 *    `login-by=mac` l'auto-logue sans re-saisie.
 */
async function prepareProfileOnRouter(
  client: RouterOSClient,
  routerId: string,
  voucherProfile: NonNullable<ReturnType<typeof voucherProfileForPackage>>,
) {
  await ensureVoucherProfileOnRouter(client, voucherProfile);
  const hookedOnLogin = appendRoamingSeenHook(
    voucherProfile.onLogin,
    getAppUrl(),
    routerId,
    deriveRouterKey(routerId),
  );
  await client
    .talk([
      "/ip/hotspot/user/profile/set",
      `=numbers=${voucherProfile.name}`,
      "=keepalive-timeout=none",
      "=idle-timeout=none",
      "=shared-users=1",
      `=on-login=${hookedOnLogin}`,
    ])
    .catch(() => {});
  // Le profil serveur doit accepter le login par MAC pour que l'utilisateur
  // `name=<MAC>` posé sur les zones sœurs soit auto-logué (additif).
  await ensureMacAutoLogin(client).catch(() => {});
}

/**
 * Charge un compte nominatif et le groupe auquel il appartient.
 * Borné à l'organisation ET au useCase : on ne modifie ni ne supprime un
 * ticket vendu par ces chemins.
 */
async function loadNamedAccount(orgId: string, voucherId: string) {
  const db = getDb();
  const [row] = await db
    .select({
      id: vouchers.id,
      username: vouchers.username,
      note: vouchers.note,
      profileName: vouchers.profileName,
      groupId: vouchers.roamingGroupId,
      useCase: vouchers.useCase,
    })
    .from(vouchers)
    .where(and(eq(vouchers.id, voucherId), eq(vouchers.orgId, orgId)))
    .limit(1);
  if (!row || row.useCase !== NAMED_USER_CASE || !row.groupId) return null;
  return row as typeof row & { groupId: string };
}


export async function provisionRoamingAccounts(opts: {
  orgId: string;
  groupId: string;
  offerId: string;
  credentials: RoamingCredential[];
  /** Commentaire posé sur le user hotspot — MikHmon l'affiche dans sa colonne. */
  comment: string;
  note: string | null;
  useCase: string;
}): Promise<ProvisionResult> {
  const { orgId, groupId, offerId, credentials, comment, note, useCase } = opts;
  if (credentials.length === 0) return { error: "Aucun compte à créer." };

  const db = getDb();
  const [group] = await db
    .select({ active: roamingGroups.active })
    .from(roamingGroups)
    .where(and(eq(roamingGroups.id, groupId), eq(roamingGroups.orgId, orgId)))
    .limit(1);
  if (!group || !group.active) return { error: "Ce groupe roaming est introuvable ou désactivé." };

  const loaded = await loadOffer(orgId, groupId, offerId);
  if (!loaded) return { error: "Cette offre roaming est indisponible." };
  const { offer, profileName, voucherProfile } = loaded;

  const groupRouters = await loadGroupRouters(orgId, groupId);
  if (groupRouters.length === 0) return { error: "Ce groupe n'a aucun MikroTik actif." };


  // Un compte roaming ne doit JAMAIS être enregistré sur un sous-ensemble de
  // ses zones. On connecte et provisionne le profil partout avant de créer le
  // premier utilisateur, puis on compense uniquement les users ajoutés par ce
  // lot en cas d'échec ultérieur.
  const connected: { router: (typeof groupRouters)[number]["router"]; client: RouterOSClient }[] = [];
  const added: { routerId: string; username: string }[] = [];
  const closeClients = () => connected.forEach(({ client }) => client.close());
  const cleanupAdded = async () => {
    await Promise.all(
      added.map(async ({ routerId, username }) => {
        const entry = connected.find(({ router }) => router.id === routerId);
        if (!entry) return;
        const userId = (await findHotspotUser(entry.client, username))?.[".id"];
        if (userId) await entry.client.talk(["/ip/hotspot/user/remove", `=.id=${userId}`]).catch(() => {});
      }),
    );
  };

  try {
    for (const { router } of groupRouters) {
      const client = await connectToRouter(router);
      connected.push({ router, client });
      await prepareProfileOnRouter(client, router.id, voucherProfile);
    }

    // Ne jamais rattacher silencieusement un compte MikHmon préexistant qui ne
    // serait pas dans la base : pour un lot le code est régénéré au prochain
    // essai, pour un compte nominatif l'opérateur choisit un autre nom.
    for (const { router, client } of connected) {
      for (const { username } of credentials) {
        const existing = await findHotspotUser(client, username);
        if (existing) {
          return {
            error: `« ${username} » existe déjà sur ${router.name}. Choisissez un autre nom (ou relancez le lot pour de nouveaux codes).`,
          };
        }
      }
    }

    for (const { router, client } of connected) {
      for (const { username, password } of credentials) {
        await client.talk([
          "/ip/hotspot/user/add",
          `=name=${username}`,
          `=password=${password}`,
          `=profile=${profileName}`,
          `=comment=${comment}`,
        ]);
        added.push({ routerId: router.id, username });
      }
    }

    const soldPriceCents = effectiveRoamingPrice(offer.defaultPriceCents, offer.priceOverrideCents);
    const voucherRows = credentials.map(({ username }) => ({
      id: randomUUID(),
      orgId,
      username,
      routerId: connected[0].router.id,
      roamingGroupId: groupId,
      roamingProfileId: offer.profileId,
      soldPriceCents,
      profileName,
      status: "PROVISIONED" as const,
      useCase,
      note,
    }));
    const links = voucherRows.flatMap((voucher) =>
      connected.map(({ router }) => ({
        orgId,
        voucherId: voucher.id,
        routerId: router.id,
        profileName,
        status: "PROVISIONED" as const,
      })),
    );
    await db.transaction(async (tx) => {
      await tx.insert(vouchers).values(voucherRows);
      await tx.insert(voucherRouters).values(links);
    });
    return { success: true, created: credentials.length };
  } catch (error) {
    await cleanupAdded();
    return {
      error: `Opération annulée : ${error instanceof Error ? error.message : "un MikroTik a refusé l'opération"}`,
    };
  } finally {
    closeClients();
  }
}

/**
 * Modifie un compte nominatif sur TOUTES les zones de son groupe.
 *
 * Champs optionnels : ce qui n'est pas fourni n'est pas touché. En particulier
 * un mot de passe vide signifie « inchangé » — pas « efface le mot de passe ».
 *
 * Le renommage est vérifié PARTOUT avant la première écriture, et les zones
 * déjà renommées sont remises à leur ancien nom si une zone refuse en cours de
 * route : un compte qui répondrait à deux noms selon la zone serait pire que
 * l'échec.
 */
export async function updateRoamingAccount(opts: {
  orgId: string;
  voucherId: string;
  username?: string;
  password?: string;
  offerId?: string;
  note: string | null;
}): Promise<{ error: string } | { success: true; updatedOn: number; skipped: string[] }> {
  const { orgId, voucherId, note } = opts;
  const db = getDb();

  const account = await loadNamedAccount(orgId, voucherId);
  if (!account) return { error: "Compte introuvable." };

  const rename = opts.username && opts.username !== account.username ? opts.username : null;
  const password = opts.password?.trim() || null;

  // Changement d'offre : le nouveau profil doit exister sur chaque zone avant
  // qu'un compte ne le référence, sinon RouterOS refuse la connexion.
  let target: Awaited<ReturnType<typeof loadOffer>> = null;
  if (opts.offerId) {
    target = await loadOffer(orgId, account.groupId, opts.offerId);
    if (!target) return { error: "Cette offre roaming est indisponible." };
  }

  if (rename) {
    const [taken] = await db
      .select({ username: vouchers.username })
      .from(vouchers)
      .where(eq(vouchers.username, rename))
      .limit(1);
    if (taken) return { error: `L'identifiant « ${rename} » est déjà utilisé.` };
  }

  const groupRouters = await loadGroupRouters(orgId, account.groupId);
  if (groupRouters.length === 0) return { error: "Ce groupe n'a aucun MikroTik actif." };

  const connected: { name: string; id: string; client: RouterOSClient }[] = [];
  const renamed: { client: RouterOSClient; userId: string }[] = [];
  const closeClients = () => connected.forEach(({ client }) => client.close());
  const skipped: string[] = [];

  try {
    for (const { router } of groupRouters) {
      try {
        connected.push({ name: router.name, id: router.id, client: await connectToRouter(router) });
      } catch {
        // Une zone injoignable ne doit pas empêcher de corriger les autres —
        // mais elle est nommée dans le retour, pas passée sous silence.
        skipped.push(router.name);
      }
    }
    if (connected.length === 0) return { error: "Aucune zone joignable." };

    if (rename) {
      for (const { name, client } of connected) {
        if (await findHotspotUser(client, rename)) {
          return { error: `« ${rename} » existe déjà sur ${name}. Choisissez un autre identifiant.` };
        }
      }
    }
    if (target) {
      for (const { id, client } of connected) {
        await prepareProfileOnRouter(client, id, target.voucherProfile);
      }
    }

    let updatedOn = 0;
    for (const { name, client } of connected) {
      const user = await findHotspotUser(client, account.username);
      if (!user?.[".id"]) {
        skipped.push(name);
        continue;
      }
      const command = ["/ip/hotspot/user/set", `=.id=${user[".id"]}`];
      if (rename) command.push(`=name=${rename}`);
      if (password) command.push(`=password=${password}`);
      if (target) command.push(`=profile=${target.profileName}`);
      if (note !== null) command.push(`=comment=${note}`);
      if (command.length > 2) await client.talk(command);
      if (rename) renamed.push({ client, userId: user[".id"] });
      updatedOn += 1;
    }
    if (updatedOn === 0) return { error: "Ce compte n'existe sur aucune zone joignable." };

    await db
      .update(vouchers)
      .set({
        ...(rename ? { username: rename } : {}),
        ...(target ? { profileName: target.profileName, roamingProfileId: target.offer.profileId } : {}),
        note,
      })
      .where(and(eq(vouchers.id, voucherId), eq(vouchers.orgId, orgId)));
    if (target) {
      await db
        .update(voucherRouters)
        .set({ profileName: target.profileName })
        .where(eq(voucherRouters.voucherId, voucherId));
    }

    // Le compagnon MAC est un second utilisateur HotSpot ; il doit suivre le
    // profil, le commentaire et le nom effectif du compte. La liaison reste
    // durable : les zones qui ne répondent pas sont marquées à reprendre par
    // syncRoamingDeviceBinding, sans annuler la modification déjà réussie.
    const [binding] = await db
      .select({ id: roamingDeviceBindings.id })
      .from(roamingDeviceBindings)
      .where(eq(roamingDeviceBindings.voucherId, voucherId))
      .limit(1);
    if (binding) await syncRoamingDeviceBinding({ bindingId: binding.id });

    return { success: true, updatedOn, skipped };
  } catch (error) {
    // Remise de l'ancien nom là où il avait déjà changé.
    await Promise.all(
      renamed.map(({ client, userId }) =>
        client
          .talk(["/ip/hotspot/user/set", `=.id=${userId}`, `=name=${account.username}`])
          .catch(() => {}),
      ),
    );
    return {
      error: `Modification annulée : ${error instanceof Error ? error.message : "un MikroTik a refusé l'opération"}`,
    };
  } finally {
    closeClients();
  }
}

/**
 * Supprime un compte nominatif de toutes ses zones.
 *
 * Trois choses partent, pas une seule :
 *  1. la session en cours — sinon le compte reste connecté jusqu'à ce qu'elle
 *     tombe d'elle-même, ce qui n'est pas une révocation ;
 *  2. l'utilisateur hotspot ;
 *  3. le COMPAGNON `name=<MAC>` posé par la propagation inter-zones — sans lui,
 *     le téléphone du technicien continuerait à s'auto-loguer alors que son
 *     compte est censé être supprimé.
 *
 * Si une zone est injoignable, la ligne est CONSERVÉE en base et l'appelant est
 * prévenu : mieux vaut un compte qui traîne dans la liste qu'un compte déclaré
 * révoqué alors qu'il fonctionne encore quelque part.
 */
export async function deleteRoamingAccount(opts: {
  orgId: string;
  voucherId: string;
}): Promise<{ error: string } | { success: true; removedOn: number; unreachable: string[] }> {
  const { orgId, voucherId } = opts;
  const db = getDb();

  const account = await loadNamedAccount(orgId, voucherId);
  if (!account) return { error: "Compte introuvable." };

  // Retire d'abord le cookie et la MAC mémorisée. Si une zone ne répond pas,
  // cette garde refuse aussi la suppression du compte : aucune rémanence ne
  // doit survivre à une révocation annoncée comme complète.
  const deviceCleared = await clearRoamingDeviceBinding({ orgId, voucherId });
  if ("error" in deviceCleared) return deviceCleared;

  const groupRouters = await loadGroupRouters(orgId, account.groupId);
  const { removedOn, unreachable } = await revokeRoamingTargets(
    groupRouters.map(({ router }) => ({ name: router.name, router })),
    async ({ router }) => {
      // Une révocation est une action interactive : attendre trois tunnels de
      // 20 s par zone bloquait l'interface pendant plusieurs minutes. Une zone
      // saine ouvre son tunnel bien avant 10 s ; l'échec reste visible et la
      // ligne SaaS n'est jamais supprimée avant une révocation complète.
      const client = await connectToRouter(router, 10_000, 1);
      try {
        await purgeHotspotAccount(client, account.username);
      } finally {
        client.close();
      }
    },
  );

  if (unreachable.length > 0) {
    return {
      error:
        `Compte retiré de ${removedOn} zone(s), mais ${unreachable.join(", ")} n'a pas répondu — ` +
        `il y est peut-être encore actif. La ligne est conservée : relancez la suppression quand la zone sera revenue.`,
    };
  }

  // Les liens voucher_routers partent en cascade avec la ligne.
  await db.delete(vouchers).where(and(eq(vouchers.id, voucherId), eq(vouchers.orgId, orgId)));
  return { success: true, removedOn, unreachable };
}

/**
 * Retire UNE zone d'un groupe roaming.
 *
 * Symétrique de extendRoamingGroup, et soumis à la même exigence : l'ajout
 * recopie les comptes du groupe sur la nouvelle zone, donc le retrait doit les
 * en effacer. Sans cela, la ligne disparaît de SafeLinkHub pendant que les
 * comptes restent actifs sur le MikroTik, sans plus aucun bouton pour les
 * couper — c'est précisément le risque qui avait fait écarter cette
 * fonctionnalité au départ.
 *
 * Deux refus, dans cet ordre :
 *
 *  1. La DERNIÈRE zone d'un groupe qui porte encore des comptes. SafeLinkHub
 *     ne conserve pas les mots de passe : ils ne sont relisibles que sur une
 *     zone vivante. Retirer la dernière les rendrait irrécupérables et les
 *     comptes ne pourraient plus jamais être reposés ailleurs.
 *  2. Une zone qui ne répond pas. On ne supprime jamais la ligne en base sur
 *     la foi d'un routeur muet : la relance sera sûre quand il reviendra.
 */
export async function shrinkRoamingGroup(opts: {
  orgId: string;
  groupId: string;
  routerId: string;
}): Promise<
  { error: string } | { success: true; routerName: string; removedAccounts: number }
> {
  const { orgId, groupId, routerId } = opts;
  const db = getDb();

  const [group] = await db
    .select({ id: roamingGroups.id, name: roamingGroups.name })
    .from(roamingGroups)
    .where(and(eq(roamingGroups.id, groupId), eq(roamingGroups.orgId, orgId)))
    .limit(1);
  if (!group) return { error: "Ce groupe roaming est introuvable." };

  const members = await loadGroupRouters(orgId, groupId);
  const target = members.find(({ router }) => router.id === routerId);
  if (!target) return { error: "Cette zone ne couvre pas ce groupe." };

  const accounts = await db
    .select({ id: vouchers.id, username: vouchers.username })
    .from(vouchers)
    .where(
      and(
        eq(vouchers.orgId, orgId),
        eq(vouchers.roamingGroupId, groupId),
        isNull(vouchers.deletedAt),
      ),
    );

  // Les compagnons `name=<MAC>` ne sont plus retrouvables par la mac-address du
  // ticket (qui n'en porte plus) : la base est désormais la seule à savoir
  // quelles adresses ce compte auto-connecte sur la zone retirée.
  const bindingMacs = new Map<string, string[]>();
  if (accounts.length > 0) {
    const rows = await db
      .select({
        voucherId: roamingDeviceBindings.voucherId,
        macAddress: roamingDeviceBindings.macAddress,
        previousMacs: roamingDeviceBindings.previousMacs,
      })
      .from(roamingDeviceBindings)
      .where(inArray(roamingDeviceBindings.voucherId, accounts.map((account) => account.id)));
    for (const row of rows) {
      bindingMacs.set(row.voucherId, [row.macAddress, ...row.previousMacs]);
    }
  }

  if (members.length === 1 && accounts.length > 0) {
    return {
      error:
        `« ${target.router.name} » est la dernière zone de ce groupe et ${accounts.length} compte(s) y vivent. ` +
        `Les mots de passe ne sont lisibles que sur une zone active : retirer celle-ci les perdrait ` +
        `définitivement. Ajoutez une autre zone d'abord, ou supprimez les comptes.`,
    };
  }

  // Révocation AVANT l'écriture en base, comme pour la suppression d'un compte.
  let removedAccounts = 0;
  if (accounts.length > 0) {
    let client;
    try {
      client = await connectToRouter(target.router, 10_000, 1);
    } catch {
      return {
        error:
          `« ${target.router.name} » ne répond pas. La zone est conservée : la retirer maintenant ` +
          `laisserait ${accounts.length} compte(s) actifs dessus sans moyen de les couper. ` +
          `Relancez quand la zone sera revenue.`,
      };
    }
    try {
      for (const account of accounts) {
        const macs = bindingMacs.get(account.id) ?? [];
        if (await purgeHotspotAccount(client, account.username, macs)) removedAccounts += 1;
      }
    } catch {
      return {
        error:
          `« ${target.router.name} » a cessé de répondre pendant le retrait ` +
          `(${removedAccounts} compte(s) déjà effacés). La zone est conservée : relancez pour finir.`,
      };
    } finally {
      client.close();
    }
  }

  /* L'état de matérialisation des appareils sur CETTE zone perd son objet.
     La ligne roaming_group_routers ne le référence pas, donc rien ne
     l'emporterait en cascade : sans ce nettoyage, la zone reviendrait avec des
     lignes « en attente » héritées d'une adhésion révolue.

     Restreint aux liaisons DE CE GROUPE : l'index unique porte sur
     (group_id, router_id), donc un même routeur peut couvrir plusieurs
     groupes. Effacer toutes les lignes du routeur emporterait l'état des
     autres groupes qui s'en servent encore. */
  const liaisonsDuGroupe = db
    .select({ id: roamingDeviceBindings.id })
    .from(roamingDeviceBindings)
    .innerJoin(vouchers, eq(vouchers.id, roamingDeviceBindings.voucherId))
    .where(
      and(
        eq(roamingDeviceBindings.orgId, orgId),
        eq(vouchers.roamingGroupId, groupId),
      ),
    );
  await db
    .delete(roamingDeviceBindingRouters)
    .where(
      and(
        eq(roamingDeviceBindingRouters.routerId, routerId),
        inArray(roamingDeviceBindingRouters.bindingId, liaisonsDuGroupe),
      ),
    );

  await db
    .delete(roamingGroupRouters)
    .where(
      and(
        eq(roamingGroupRouters.groupId, groupId),
        eq(roamingGroupRouters.routerId, routerId),
        eq(roamingGroupRouters.orgId, orgId),
      ),
    );

  return { success: true, routerName: target.router.name, removedAccounts };
}

/** Relance la synchronisation d'un appareil d'un compte nominatif. */
export async function resyncNamedRoamingDevice(opts: {
  orgId: string;
  voucherId: string;
}) {
  const account = await loadNamedAccount(opts.orgId, opts.voucherId);
  if (!account) return { error: "Compte introuvable." };
  return resyncRoamingDeviceBinding(opts);
}

/** Autorise explicitement un nouveau téléphone en supprimant l'ancien lien. */
export async function replaceNamedRoamingDevice(opts: {
  orgId: string;
  voucherId: string;
}) {
  const account = await loadNamedAccount(opts.orgId, opts.voucherId);
  if (!account) return { error: "Compte introuvable." };
  const result = await clearRoamingDeviceBinding(opts);
  if ("error" in result) return result;
  if (!result.hadBinding) return { error: "Aucun appareil n'est encore mémorisé pour ce compte." };
  return { success: true, removedOn: result.removedOn };
}
