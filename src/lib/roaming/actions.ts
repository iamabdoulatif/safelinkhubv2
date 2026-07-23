"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
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
import { requireAdminSession } from "@/lib/auth/session";
import { connectToRouter } from "@/lib/mikrotik/router-sync";
import type { RouterOSClient } from "@/lib/mikrotik/client";
import {
  packageProfileName,
  voucherProfileForPackage,
  SUPPORTED_PROFILE_DURATIONS,
} from "@/lib/mikrotik/package-voucher-profile";
import { ensureVoucherProfileOnRouter } from "@/lib/mikrotik/voucher-profile-provision";
import { parseRoamingPriceOverride, roamingGroupCode, roamingRouterProfileName } from "./forms";
import { effectiveRoamingPrice } from "./pricing";

const CODE_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";

function randomCode(length = 6) {
  let code = "";
  for (let i = 0; i < length; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return code;
}

function sanitizePrefix(raw: string) {
  return raw.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10);
}

function positiveInteger(value: FormDataEntryValue | null) {
  const number = Number(value ?? 0);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function refreshRoamingPages() {
  revalidatePath("/admin/roaming");
  revalidatePath("/admin/vouchers");
}

export async function createRoamingGroup(_prevState: unknown, formData: FormData) {
  const session = await requireAdminSession();
  if (!session) return { error: "Non authentifié." };

  const name = String(formData.get("name") ?? "").trim().slice(0, 80);
  const requestedCode = String(formData.get("code") ?? "").trim();
  const code = roamingGroupCode(requestedCode || name);
  const routerIds = [...new Set(formData.getAll("routerIds").map(String).filter(Boolean))];
  if (!name) return { error: "Donnez un nom au groupe roaming." };
  if (routerIds.length === 0) return { error: "Sélectionnez au moins un MikroTik." };

  const db = getDb();
  const members = await db
    .select({ id: routers.id })
    .from(routers)
    .where(and(eq(routers.orgId, session.orgId), inArray(routers.id, routerIds)));
  if (members.length !== routerIds.length) return { error: "Un MikroTik sélectionné ne fait pas partie de votre organisation." };

  const [existing] = await db
    .select({ id: roamingGroups.id })
    .from(roamingGroups)
    .where(and(eq(roamingGroups.orgId, session.orgId), eq(roamingGroups.code, code)))
    .limit(1);
  if (existing) return { error: `Le code de groupe « ${code} » existe déjà.` };

  const groupId = randomUUID();
  await db.insert(roamingGroups).values({ id: groupId, orgId: session.orgId, name, code });
  await db.insert(roamingGroupRouters).values(
    members.map((router) => ({ orgId: session.orgId, groupId, routerId: router.id })),
  );
  refreshRoamingPages();
  return { success: true, groupId };
}

export async function createRoamingProfile(_prevState: unknown, formData: FormData) {
  const session = await requireAdminSession();
  if (!session) return { error: "Non authentifié." };

  const durationValue = positiveInteger(formData.get("durationValue"));
  const durationUnit = String(formData.get("durationUnit") ?? "Hours");
  const uploadMbps = positiveInteger(formData.get("uploadMbps"));
  const downloadMbps = positiveInteger(formData.get("downloadMbps"));
  const defaultPriceCents = Number(formData.get("defaultPriceCents") ?? -1);
  if (!durationValue || !uploadMbps || !downloadMbps || !Number.isInteger(defaultPriceCents) || defaultPriceCents < 0) {
    return { error: "Saisissez une durée, des débits et un tarif valide." };
  }

  const name = packageProfileName(durationValue, durationUnit);
  if (!name) {
    return { error: `Durée non reconnue. Profils supportés : ${SUPPORTED_PROFILE_DURATIONS}.` };
  }

  const db = getDb();
  const [existing] = await db
    .select({ id: roamingProfiles.id })
    .from(roamingProfiles)
    .where(and(eq(roamingProfiles.orgId, session.orgId), eq(roamingProfiles.name, name)))
    .limit(1);
  if (existing) return { error: `Le profil « ${name} » existe déjà.` };

  await db.insert(roamingProfiles).values({
    orgId: session.orgId,
    name,
    durationValue,
    durationUnit,
    uploadMbps,
    downloadMbps,
    defaultPriceCents,
  });
  refreshRoamingPages();
  return { success: true, name };
}

export async function saveRoamingOffer(_prevState: unknown, formData: FormData) {
  const session = await requireAdminSession();
  if (!session) return { error: "Non authentifié." };

  const groupId = String(formData.get("groupId") ?? "");
  const profileId = String(formData.get("profileId") ?? "");
  const priceOverrideCents = parseRoamingPriceOverride(String(formData.get("priceOverrideCents") ?? ""));
  if (!groupId || !profileId) return { error: "Sélectionnez un groupe et un profil." };
  if (priceOverrideCents === undefined) return { error: "Le tarif spécifique doit être un entier positif ou zéro." };

  const db = getDb();
  const [[group], [profile]] = await Promise.all([
    db.select({ id: roamingGroups.id }).from(roamingGroups).where(and(eq(roamingGroups.id, groupId), eq(roamingGroups.orgId, session.orgId))).limit(1),
    db.select({ id: roamingProfiles.id }).from(roamingProfiles).where(and(eq(roamingProfiles.id, profileId), eq(roamingProfiles.orgId, session.orgId))).limit(1),
  ]);
  if (!group || !profile) return { error: "Ce groupe ou ce profil est introuvable." };

  const [existing] = await db
    .select({ id: roamingGroupOffers.id })
    .from(roamingGroupOffers)
    .where(and(eq(roamingGroupOffers.groupId, groupId), eq(roamingGroupOffers.profileId, profileId)))
    .limit(1);
  if (existing) {
    await db.update(roamingGroupOffers).set({ priceOverrideCents, active: true }).where(eq(roamingGroupOffers.id, existing.id));
  } else {
    await db.insert(roamingGroupOffers).values({ orgId: session.orgId, groupId, profileId, priceOverrideCents });
  }
  refreshRoamingPages();
  return { success: true };
}

/**
 * Creates the same real Hotspot account on every router in the selected
 * roaming group. Existing reconciliation then freezes the first expiry date
 * and propagates it back to every group member.
 */
export async function generateRoamingVouchers(_prevState: unknown, formData: FormData) {
  const session = await requireAdminSession();
  if (!session) return { error: "Non authentifié." };

  const groupId = String(formData.get("groupId") ?? "");
  const offerId = String(formData.get("offerId") ?? "");
  const quantity = Number(formData.get("quantity") ?? 0);
  const note = String(formData.get("note") ?? "").trim().slice(0, 180) || null;
  const prefix = sanitizePrefix(String(formData.get("prefix") ?? ""));
  if (!groupId || !offerId) return { error: "Sélectionnez une offre roaming." };
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 200) {
    return { error: "La quantité doit être comprise entre 1 et 200." };
  }

  const db = getDb();
  const [group] = await db
    .select({ id: roamingGroups.id, active: roamingGroups.active })
    .from(roamingGroups)
    .where(and(eq(roamingGroups.id, groupId), eq(roamingGroups.orgId, session.orgId)))
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
    .where(and(eq(roamingGroupOffers.id, offerId), eq(roamingGroupOffers.groupId, groupId), eq(roamingGroupOffers.orgId, session.orgId)))
    .limit(1);
  if (!offer || !offer.active || !offer.profileActive) return { error: "Cette offre roaming est indisponible." };

  const groupRouters = await db
    .select({ router: routers })
    .from(roamingGroupRouters)
    .innerJoin(routers, eq(roamingGroupRouters.routerId, routers.id))
    .where(and(eq(roamingGroupRouters.groupId, groupId), eq(roamingGroupRouters.orgId, session.orgId), eq(routers.orgId, session.orgId)));
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

  const makeCode = () => `${prefix}${randomCode()}`;
  const batch = new Set<string>();
  while (batch.size < quantity) batch.add(makeCode());
  const codes = [...batch];
  const existingCodes = await db.select({ username: vouchers.username }).from(vouchers).where(inArray(vouchers.username, codes));
  const taken = new Set(existingCodes.map((voucher) => voucher.username));
  const codeList = codes.map((code) => {
    let candidate = code;
    while (taken.has(candidate)) candidate = makeCode();
    taken.add(candidate);
    return candidate;
  });

  // Un ticket roaming ne doit JAMAIS être enregistré sur un sous-ensemble de
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
    for (const { router } of groupRouters) {
      const client = await connectToRouter(router);
      connected.push({ router, client });
      await ensureVoucherProfileOnRouter(client, voucherProfile);
    }

    // Ne jamais rattacher silencieusement un ancien compte MikHmon qui ne
    // serait pas dans la base : le code est régénéré au prochain essai.
    for (const { router, client } of connected) {
      for (const code of codeList) {
        const existing = await client.talk(["/ip/hotspot/user/print", `?name=${code}`]);
        if (existing.length > 0) {
          return { error: `Collision de code sur ${router.name}. Relancez le lot pour générer de nouveaux tickets.` };
        }
      }
    }

    for (const { router, client } of connected) {
      for (const code of codeList) {
        await client.talk(["/ip/hotspot/user/add", `=name=${code}`, `=password=${code}`, `=profile=${profileName}`]);
        added.push({ routerId: router.id, username: code });
      }
    }

    const soldPriceCents = effectiveRoamingPrice(offer.defaultPriceCents, offer.priceOverrideCents);
    const voucherRows = codeList.map((username) => ({
      id: randomUUID(),
      orgId: session.orgId,
      username,
      routerId: connected[0].router.id,
      roamingGroupId: groupId,
      roamingProfileId: offer.profileId,
      soldPriceCents,
      profileName,
      status: "PROVISIONED" as const,
      useCase: "Roaming Batch Create",
      note,
    }));
    const links = voucherRows.flatMap((voucher) =>
      connected.map(({ router }) => ({
        orgId: session.orgId,
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
    refreshRoamingPages();
    return { success: true, created: codeList.length };
  } catch (error) {
    await cleanupAdded();
    return { error: `Lot roaming annulé : ${error instanceof Error ? error.message : "un MikroTik a refusé l'opération"}` };
  } finally {
    closeClients();
  }
}
