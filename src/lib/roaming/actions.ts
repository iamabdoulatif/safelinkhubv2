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
  vouchers,
} from "@/lib/db/schema";
import { requireAdminSession } from "@/lib/auth/session";
import { connectToRouter } from "@/lib/mikrotik/router-sync";
import type { RouterOSClient } from "@/lib/mikrotik/client";
import {
  packageProfileName,
  isUnlimitedUnit,
  SUPPORTED_PROFILE_DURATIONS,
} from "@/lib/mikrotik/package-voucher-profile";
import {
  isValidRoamingUsername,
  parseRoamingPriceOverride,
  roamingGroupCode,
  roamingUserPassword,
} from "./forms";

import { randomAccessCode as randomCode } from "@/lib/access-code";
import {
  NAMED_USER_CASE,
  deleteRoamingAccount,
  extendRoamingGroup,
  provisionRoamingAccounts,
  updateRoamingAccount,
} from "./provision";


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

/** Ajoute des zones à un groupe existant et y synchronise ses comptes. */
export async function addRoamingGroupRouters(_prevState: unknown, formData: FormData) {
  const session = await requireAdminSession();
  if (!session) return { error: "Non authentifié." };

  const groupId = String(formData.get("groupId") ?? "");
  const routerIds = [...new Set(formData.getAll("routerIds").map(String).filter(Boolean))];
  if (!groupId || routerIds.length === 0) return { error: "Sélectionnez le groupe et au moins une nouvelle zone." };

  const result = await extendRoamingGroup({ orgId: session.orgId, groupId, routerIds });
  if ("error" in result) return result;
  refreshRoamingPages();
  return result;
}

export async function createRoamingProfile(_prevState: unknown, formData: FormData) {
  const session = await requireAdminSession();
  if (!session) return { error: "Non authentifié." };

  const durationUnit = String(formData.get("durationUnit") ?? "Hours");
  const unlimited = isUnlimitedUnit(durationUnit);
  const parsedDuration = positiveInteger(formData.get("durationValue"));
  const uploadMbps = positiveInteger(formData.get("uploadMbps"));
  const downloadMbps = positiveInteger(formData.get("downloadMbps"));
  const defaultPriceCents = Number(formData.get("defaultPriceCents") ?? -1);
  if (!uploadMbps || !downloadMbps || !Number.isInteger(defaultPriceCents) || defaultPriceCents < 0) {
    return { error: "Saisissez des débits et un tarif valide." };
  }
  if (!unlimited && !parsedDuration) {
    return { error: "Saisissez une durée valide." };
  }
  // Un profil ILLIMITÉ n'a pas de durée à saisir : 0 marque explicitement
  // « aucune échéance » plutôt qu'un nombre qui ne voudrait rien dire.
  const durationValue = unlimited ? 0 : (parsedDuration as number);

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
  const makeCode = () => `${prefix}${randomCode()}`;
  const batch = new Set<string>();
  while (batch.size < quantity) batch.add(makeCode());
  const codes = [...batch];
  const existingCodes = await db
    .select({ username: vouchers.username })
    .from(vouchers)
    .where(inArray(vouchers.username, codes));
  const taken = new Set(existingCodes.map((voucher) => voucher.username));
  const codeList = codes.map((code) => {
    let candidate = code;
    while (taken.has(candidate)) candidate = makeCode();
    taken.add(candidate);
    return candidate;
  });

  // La NOTE du lot (ex. « lot-aout ») est posée comme COMMENTAIRE du user
  // hotspot → MikHmon la lit dans sa colonne « Commentaire », ce qui permet de
  // filtrer/imprimer le lot depuis MikHmon (générés sur le SaaS, imprimés sur
  // MikHmon). Sur les tickets NEUFS le commentaire = la note ; à la 1re
  // connexion le on-login du profil y stampe la date d'expiration (parité
  // MikHmon), la note reste donc utile tant que le ticket n'est pas activé.
  const result = await provisionRoamingAccounts({
    orgId: session.orgId,
    groupId,
    offerId,
    // Sur un ticket vendu, le code EST le mot de passe.
    credentials: codeList.map((code) => ({ username: code, password: code })),
    comment: note || `Lot ${new Date().toISOString().slice(0, 10)}`,
    note,
    useCase: "Roaming Batch Create",
  });
  if ("error" in result) return result;
  refreshRoamingPages();
  return { success: true, created: result.created };
}

/**
 * Compte NOMINATIF : un identifiant et un mot de passe choisis, au lieu d'un
 * code tiré au hasard.
 *
 * POURQUOI : les codes en masse conviennent à la vente, pas aux personnes. Un
 * administrateur ou un technicien de zone doit pouvoir se connecter partout
 * avec un identifiant qu'il retient — « aroune », pas « k3f9zq ». Associé à une
 * offre illimitée, cela donne un compte de service qui n'expire pas.
 *
 * Le compte est créé sur TOUTES les zones du groupe, par la même mécanique que
 * les lots : mêmes options de profil, même auto-login inter-zones, et la même
 * règle du tout-ou-rien (aucune zone n'est laissée de côté).
 */
export async function createRoamingUser(_prevState: unknown, formData: FormData) {
  const session = await requireAdminSession();
  if (!session) return { error: "Non authentifié." };

  const groupId = String(formData.get("groupId") ?? "");
  const offerId = String(formData.get("offerId") ?? "");
  const username = String(formData.get("username") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim().slice(0, 180) || null;

  if (!groupId || !offerId) return { error: "Sélectionnez un groupe et une offre." };
  if (!isValidRoamingUsername(username)) {
    return {
      error:
        "L'identifiant doit faire 2 à 32 caractères, sans espace ni accent (lettres, chiffres, point, tiret, souligné).",
    };
  }
  const password = roamingUserPassword(String(formData.get("password") ?? ""), username);
  if (!password) return { error: "Le mot de passe doit faire 2 à 64 caractères." };

  const db = getDb();
  const [taken] = await db
    .select({ username: vouchers.username })
    .from(vouchers)
    .where(eq(vouchers.username, username))
    .limit(1);
  if (taken) return { error: `L'identifiant « ${username} » est déjà utilisé.` };

  const result = await provisionRoamingAccounts({
    orgId: session.orgId,
    groupId,
    offerId,
    credentials: [{ username, password }],
    comment: note || `Compte ${username}`,
    note,
    useCase: NAMED_USER_CASE,
  });
  if ("error" in result) return result;
  refreshRoamingPages();
  return { success: true, username };
}

/**
 * Relit le mot de passe d'un compte roaming SUR LE ROUTEUR.
 *
 * Le SaaS ne stocke pas ce mot de passe : la source de vérité est RouterOS, qui
 * le conserve en clair dans l'utilisateur hotspot. Le relire évite d'en garder
 * une seconde copie chez nous, et reste juste même si quelqu'un l'a changé sur
 * l'appareil. Sans cela, un compte de technicien créé il y a trois mois serait
 * définitivement perdu.
 */
export async function revealRoamingUserPassword(voucherId: string) {
  const session = await requireAdminSession();
  if (!session) return { error: "Non authentifié." };

  const db = getDb();
  const [row] = await db
    .select({ username: vouchers.username, routerId: vouchers.routerId })
    .from(vouchers)
    .where(and(eq(vouchers.id, voucherId), eq(vouchers.orgId, session.orgId)))
    .limit(1);
  if (!row || !row.routerId) return { error: "Compte introuvable." };

  const [router] = await db
    .select()
    .from(routers)
    .where(and(eq(routers.id, row.routerId), eq(routers.orgId, session.orgId)))
    .limit(1);
  if (!router) return { error: "Routeur introuvable." };

  let client: RouterOSClient;
  try {
    client = await connectToRouter(router);
  } catch {
    return { error: `Routeur ${router.name} injoignable — impossible de relire le mot de passe.` };
  }
  try {
    const users = await client.talk(["/ip/hotspot/user/print", `?name=${row.username}`]);
    const password = users[0]?.password ?? "";
    if (!password) return { error: "Ce compte n'a plus de mot de passe sur le routeur." };
    return { success: true as const, username: row.username, password };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Lecture impossible." };
  } finally {
    client.close();
  }
}

/**
 * Modifie un compte nominatif : identifiant, mot de passe, offre, rôle.
 *
 * Un champ laissé vide n'est pas touché — en particulier le mot de passe, où
 * « vide » veut dire « inchangé » et non « efface-le ». C'est l'inverse de la
 * création, où vide reprend l'identifiant : à la création il faut bien une
 * valeur, à la modification il faut surtout ne rien casser par omission.
 */
export async function updateRoamingUser(_prevState: unknown, formData: FormData) {
  const session = await requireAdminSession();
  if (!session) return { error: "Non authentifié." };

  const voucherId = String(formData.get("voucherId") ?? "");
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "").trim();
  const offerId = String(formData.get("offerId") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim().slice(0, 180) || null;
  if (!voucherId) return { error: "Compte introuvable." };
  if (username && !isValidRoamingUsername(username)) {
    return {
      error:
        "L'identifiant doit faire 2 à 32 caractères, sans espace ni accent (lettres, chiffres, point, tiret, souligné, arobase).",
    };
  }
  if (password && (password.length < 2 || password.length > 64)) {
    return { error: "Le mot de passe doit faire 2 à 64 caractères." };
  }

  const result = await updateRoamingAccount({
    orgId: session.orgId,
    voucherId,
    username: username || undefined,
    password: password || undefined,
    offerId: offerId || undefined,
    note,
  });
  if ("error" in result) return result;
  refreshRoamingPages();
  return {
    success: true,
    updatedOn: result.updatedOn,
    // Les zones sautées sont dites, pas tues : le compte y garde son ancien état.
    skipped: result.skipped,
  };
}

/**
 * Supprime un compte nominatif de toutes ses zones, session en cours comprise.
 *
 * Refuse de retirer la ligne tant qu'une zone n'a pas répondu : un compte
 * déclaré révoqué alors qu'il fonctionne encore quelque part serait pire qu'un
 * compte qui traîne dans la liste.
 */
export async function deleteRoamingUser(_prevState: unknown, formData: FormData) {
  const session = await requireAdminSession();
  if (!session) return { error: "Non authentifié." };

  const voucherId = String(formData.get("voucherId") ?? "");
  if (!voucherId) return { error: "Compte introuvable." };

  const result = await deleteRoamingAccount({ orgId: session.orgId, voucherId });
  if ("error" in result) return result;
  refreshRoamingPages();
  return { success: true, removedOn: result.removedOn };
}
