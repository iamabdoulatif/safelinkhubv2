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
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  roamingGroupOffers,
  roamingGroupRouters,
  roamingGroups,
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
import { appendRoamingSeenHook } from "./on-login-hook";
import { deriveRouterKey } from "./webhook-secret";

/**
 * Un compte à créer. `password` est distinct de `username` pour les comptes
 * nominatifs ; sur un ticket vendu les deux valent le code.
 */
export type RoamingCredential = { username: string; password: string };

export type ProvisionResult = { error: string } | { success: true; created: number };

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
    .select({ id: roamingGroups.id, active: roamingGroups.active })
    .from(roamingGroups)
    .where(and(eq(roamingGroups.id, groupId), eq(roamingGroups.orgId, orgId)))
    .limit(1);
  if (!group || !group.active) return { error: "Ce groupe roaming est introuvable ou désactivé." };

  const [offer] = await db
    .select({
      id: roamingGroupOffers.id,
      active: roamingGroupOffers.active,
      priceOverrideCents: roamingGroupOffers.priceOverrideCents,
      profileId: roamingProfiles.id,
      profileName: roamingProfiles.name,
      durationValue: roamingProfiles.durationValue,
      durationUnit: roamingProfiles.durationUnit,
      uploadMbps: roamingProfiles.uploadMbps,
      downloadMbps: roamingProfiles.downloadMbps,
      defaultPriceCents: roamingProfiles.defaultPriceCents,
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
  if (!offer || !offer.active || !offer.profileActive) {
    return { error: "Cette offre roaming est indisponible." };
  }

  const groupRouters = await db
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
  if (groupRouters.length === 0) return { error: "Ce groupe n'a aucun MikroTik actif." };

  const baseProfileName = packageProfileName(offer.durationValue, offer.durationUnit);
  const profileName = baseProfileName
    ? roamingRouterProfileName(group.id, baseProfileName)
    : null;
  const voucherProfile = voucherProfileForPackage(
    offer.durationValue,
    offer.durationUnit,
    effectiveRoamingPrice(offer.defaultPriceCents, offer.priceOverrideCents),
    {
      name: profileName ?? undefined,
      uploadMbps: offer.uploadMbps,
      downloadMbps: offer.downloadMbps,
    },
  );
  if (!profileName || !voucherProfile) return { error: "Le profil roaming est invalide." };

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
        const users = await entry.client
          .talk(["/ip/hotspot/user/print", `?name=${username}`])
          .catch(() => [] as Record<string, string>[]);
        const userId = users[0]?.[".id"];
        if (userId) await entry.client.talk(["/ip/hotspot/user/remove", `=.id=${userId}`]).catch(() => {});
      }),
    );
  };

  try {
    const appUrl = getAppUrl();
    for (const { router } of groupRouters) {
      const client = await connectToRouter(router);
      connected.push({ router, client });
      await ensureVoucherProfileOnRouter(client, voucherProfile);
      // ROAMING : un compte doit rester connecté LONGTEMPS entre zones. Par
      // défaut le profil hérite d'un keepalive-timeout court (2m) → la session
      // « lâche » après quelques minutes (téléphone en veille). On lève donc les
      // timeouts (keepalive/idle = none, la validité reste bornée par
      // l'expiration du forfait via le scheduler — sauf profil illimité, qui
      // n'en a pas).
      //
      // AUTO-LOGIN INTER-ZONES (1 appareil / compte) :
      //  • shared-users=1 → anti-partage (le compte se lie au 1er MAC vu) ;
      //  • on-login étendu → à chaque connexion, le routeur signale (code, MAC)
      //    au SaaS (/api/roaming/seen) qui lie ce MAC au compte sur les zones
      //    sœurs, où `login-by=mac` l'auto-logue sans re-saisie.
      const hookedOnLogin = appendRoamingSeenHook(
        voucherProfile.onLogin,
        appUrl,
        router.id,
        deriveRouterKey(router.id),
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

    // Ne jamais rattacher silencieusement un compte MikHmon préexistant qui ne
    // serait pas dans la base : pour un lot le code est régénéré au prochain
    // essai, pour un compte nominatif l'opérateur choisit un autre nom.
    for (const { router, client } of connected) {
      for (const { username } of credentials) {
        const existing = await client.talk(["/ip/hotspot/user/print", `?name=${username}`]);
        if (existing.length > 0) {
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
