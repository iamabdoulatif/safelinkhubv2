"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { packages, vouchers, voucherRouters, routers } from "@/lib/db/schema";
import { requireAdminSession } from "@/lib/auth/session";
import { connectToRouter } from "@/lib/mikrotik/router-sync";
import type { RouterOSClient } from "@/lib/mikrotik/client";
import {
  packageProfileName,
  voucherProfileForPackage,
  SUPPORTED_PROFILE_DURATIONS,
} from "@/lib/mikrotik/package-voucher-profile";
import { ensureVoucherProfileOnRouter } from "@/lib/mikrotik/voucher-profile-provision";
import { parseExpiryComment, wallToDate, wallKey, type Wall } from "./reconcile";
import { durationFromProfileName, durationToMs } from "./expiry";
import { matchPackageForProfile, parseMikhmonVoucherCsv } from "./csv-import";
import { isImportedVoucherUseCase } from "./source";

import { randomAccessCode as randomCode } from "@/lib/access-code";

// Préfixe de lot : uniquement des minuscules/chiffres (mêmes contraintes que
// les codes hotspot), 10 caractères max. On nettoie silencieusement plutôt que
// de rejeter, pour ne pas bloquer l'admin sur une majuscule ou un tiret.
function sanitizePrefix(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10);
}

/**
 * Génère des vouchers RÉELS : chaque code est créé comme utilisateur hotspot
 * sur CHAQUE MikroTik choisi (via le tunnel WireGuard), avec le profil dont la
 * durée correspond au forfait. Le même code fonctionne donc sur toutes les
 * zones WiFi sélectionnées. On n'enregistre en base QUE les codes réellement
 * créés sur au moins un routeur — un voucher présent sur safelinkhub.io existe
 * forcément sur le(s) routeur(s).
 */
export async function generateVouchers(_prevState: unknown, formData: FormData) {
  const session = await requireAdminSession();
  if (!session) return { error: "Non authentifié." };

  const packageId = String(formData.get("packageId") ?? "");
  const routerIds = formData
    .getAll("routerIds")
    .map((r) => String(r))
    .filter(Boolean);
  const quantity = Number(formData.get("quantity") ?? 0);
  const note = String(formData.get("note") ?? "").trim() || null;
  const prefix = sanitizePrefix(String(formData.get("prefix") ?? "").trim());

  if (!packageId) return { error: "Sélectionnez un forfait." };
  if (routerIds.length === 0) return { error: "Sélectionnez au moins un routeur." };
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 200) {
    return { error: "La quantité doit être un entier entre 1 et 200." };
  }

  const db = getDb();
  const [pkg] = await db
    .select({
      id: packages.id,
      name: packages.name,
      active: packages.active,
      durationValue: packages.durationValue,
      durationUnit: packages.durationUnit,
      priceCents: packages.priceCents,
    })
    .from(packages)
    .where(and(eq(packages.id, packageId), eq(packages.orgId, session.orgId)))
    .limit(1);

  if (!pkg) return { error: "Forfait introuvable." };
  if (!pkg.active) return { error: "Ce forfait est désactivé." };

  const profileName = packageProfileName(pkg.durationValue, pkg.durationUnit);
  if (!profileName) {
    return {
      error: `La durée du forfait « ${pkg.name} » ne correspond à aucun profil hotspot du routeur. Durées supportées : ${SUPPORTED_PROFILE_DURATIONS}.`,
    };
  }

  const orgRouters = await db
    .select()
    .from(routers)
    .where(and(inArray(routers.id, routerIds), eq(routers.orgId, session.orgId)));
  if (orgRouters.length === 0) return { error: "Routeur introuvable." };

  // Codes uniques dans le lot (préfixe inclus), puis on écarte ceux déjà en
  // base (username unique globalement) pour ne pas faire échouer l'insert.
  const withPrefix = () => `${prefix}${randomCode()}`;
  const batch = new Set<string>();
  while (batch.size < quantity) batch.add(withPrefix());
  let codeList = [...batch];
  const clash = await db
    .select({ username: vouchers.username })
    .from(vouchers)
    .where(inArray(vouchers.username, codeList));
  const taken = new Set(clash.map((r) => r.username));
  codeList = codeList.map((c) => {
    let candidate = c;
    while (taken.has(candidate)) candidate = withPrefix();
    taken.add(candidate);
    return candidate;
  });

  const voucherProfile = voucherProfileForPackage(
    pkg.durationValue,
    pkg.durationUnit,
    pkg.priceCents,
  );

  // Pour chaque code, l'ensemble des routeurs où il a été RÉELLEMENT créé.
  const createdOn = new Map<string, string[]>();
  const routerErrors: string[] = [];

  for (const router of orgRouters) {
    let client: RouterOSClient;
    try {
      client = await connectToRouter(router);
    } catch (e) {
      routerErrors.push(
        `${router.name} injoignable : ${e instanceof Error ? e.message : "connexion échouée"}`,
      );
      continue; // on tente les autres routeurs
    }
    try {
      if (voucherProfile) await ensureVoucherProfileOnRouter(client, voucherProfile);
      for (const code of codeList) {
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
            ]);
          }
          const list = createdOn.get(code) ?? [];
          list.push(router.id);
          createdOn.set(code, list);
        } catch (e) {
          routerErrors.push(
            `${router.name} / ${code} : ${e instanceof Error ? e.message : "échec"}`,
          );
          break; // routeur en échec : on passe au suivant
        }
      }
    } finally {
      client.close();
    }
  }

  // N'enregistre que les codes créés sur au moins un routeur.
  const created = codeList.filter((c) => (createdOn.get(c)?.length ?? 0) > 0);
  if (created.length > 0) {
    // On pré-génère les UUID des vouchers pour construire les liens de zone
    // sans dépendre d'un RETURNING, puis une transaction exécute les deux
    // INSERT de façon atomique.
    const voucherRows = created.map((code) => ({
      id: randomUUID(),
      orgId: session.orgId,
      username: code,
      packageId: pkg.id,
      routerId: createdOn.get(code)![0], // routeur principal
      profileName,
      status: "PROVISIONED" as const,
      useCase: "Batch Create",
      note,
    }));

    const links = voucherRows.flatMap((v) =>
      (createdOn.get(v.username) ?? []).map((routerId) => ({
        orgId: session.orgId,
        voucherId: v.id,
        routerId,
        profileName,
        status: "PROVISIONED" as const,
      })),
    );

    if (links.length > 0) {
      await db.transaction(async (tx) => {
        await tx.insert(vouchers).values(voucherRows);
        await tx.insert(voucherRouters).values(links);
      });
    } else {
      await db.insert(vouchers).values(voucherRows);
    }
    revalidatePath("/admin/vouchers");
  }

  if (created.length < quantity || routerErrors.length > 0) {
    const detail = routerErrors.slice(0, 3).join(" ; ");
    return created.length > 0
      ? {
          error: `Créés : ${created.length}/${quantity} sur ${orgRouters.length} routeur(s).${detail ? " Incidents : " + detail : ""}`,
        }
      : { error: `Aucun voucher créé. ${detail || "Routeur(s) injoignable(s)."}` };
  }
  return { success: true, created: created.length };
}

/**
 * Archive des vouchers sans toucher aux utilisateurs RouterOS. Cette absence
 * d'effet distant rend la restauration exacte, même si un routeur est hors ligne.
 */
export async function archiveVouchers(ids: string[]) {
  const session = await requireAdminSession();
  if (!session) return { error: "Non authentifié." };
  if (!Array.isArray(ids) || ids.length === 0) return { error: "Aucun voucher." };

  const db = getDb();
  const rows = await db
    .select({ id: vouchers.id })
    .from(vouchers)
    .where(
      and(
        inArray(vouchers.id, ids),
        eq(vouchers.orgId, session.orgId),
        isNull(vouchers.deletedAt),
      ),
    );
  if (rows.length === 0) return { error: "Aucun ticket actif à archiver." };

  await db
    .update(vouchers)
    .set({ deletedAt: new Date() })
    .where(and(inArray(vouchers.id, rows.map((row) => row.id)), eq(vouchers.orgId, session.orgId)));
  revalidatePath("/admin/vouchers");
  return { success: true, archived: rows.length };
}

/**
 * Retire de l'inventaire actif les tickets importés depuis MikHmon/CSV.
 *
 * C'est volontairement un archivage DB-only : aucune connexion MikroTik et
 * aucune commande `/ip/hotspot/user/remove` ne sont exécutées. Les liens de
 * zone restent donc intacts et la corbeille permet une restauration exacte.
 */
export async function archiveImportedVouchers() {
  const session = await requireAdminSession();
  if (!session) return { error: "Non authentifié." };

  const db = getDb();
  const rows = await db
    .select({ id: vouchers.id })
    .from(vouchers)
    .where(
      and(
        eq(vouchers.orgId, session.orgId),
        isNull(vouchers.deletedAt),
        sql`lower(trim(coalesce(${vouchers.useCase}, ''))) like 'imported%'`,
      ),
    );
  if (rows.length === 0) return { success: true, archived: 0 };

  await db
    .update(vouchers)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(vouchers.orgId, session.orgId),
        isNull(vouchers.deletedAt),
        inArray(vouchers.id, rows.map((row) => row.id)),
      ),
    );
  revalidatePath("/admin/vouchers");
  return { success: true, archived: rows.length };
}

/** Restaure les tickets de la corbeille avec leurs liaisons de routeur intactes. */
export async function restoreVouchers(ids: string[]) {
  const session = await requireAdminSession();
  if (!session) return { error: "Non authentifié." };
  if (!Array.isArray(ids) || ids.length === 0) return { error: "Aucun voucher." };

  const db = getDb();
  const rows = await db
    .select({ id: vouchers.id })
    .from(vouchers)
    .where(
      and(
        inArray(vouchers.id, ids),
        eq(vouchers.orgId, session.orgId),
        isNotNull(vouchers.deletedAt),
      ),
    );
  if (rows.length === 0) return { error: "Aucun ticket archivé à restaurer." };

  await db
    .update(vouchers)
    .set({ deletedAt: null })
    .where(and(inArray(vouchers.id, rows.map((row) => row.id)), eq(vouchers.orgId, session.orgId)));
  revalidatePath("/admin/vouchers");
  return { success: true, restored: rows.length };
}

// Plafond d'import par passage : un routeur peut porter des milliers
// d'utilisateurs hotspot (historique MikHmon). On borne l'insert pour ne pas
// enfler une transaction unique ; le surplus est signalé et récupéré au
// prochain import (les tickets déjà importés sont sautés, donc l'opération est
// idempotente et progresse à chaque passage).
const MAX_IMPORT_PER_RUN = 2000;
const MAX_CSV_IMPORT_BYTES = 2 * 1024 * 1024;

/**
 * Adopte un export CSV déjà créé dans MikHmon. Cette action ne se connecte pas
 * au routeur : le fichier décrit des utilisateurs existants et n'en provisionne
 * aucun. Le mot de passe CSV est éliminé par le parseur et n'est jamais stocké.
 */
export async function importCsvTickets(_prevState: unknown, formData: FormData) {
  const session = await requireAdminSession();
  if (!session) return { error: "Non authentifié." };

  const routerId = String(formData.get("routerId") ?? "");
  const file = formData.get("voucherCsv");
  if (!routerId) return { error: "Sélectionnez le routeur source." };
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choisissez un fichier CSV non vide." };
  }
  if (file.size > MAX_CSV_IMPORT_BYTES) {
    return { error: "Le fichier CSV dépasse la limite de 2 Mo." };
  }

  const db = getDb();
  const [router] = await db
    .select({ id: routers.id })
    .from(routers)
    .where(and(eq(routers.id, routerId), eq(routers.orgId, session.orgId)))
    .limit(1);
  if (!router) return { error: "Routeur introuvable." };

  const parsed = parseMikhmonVoucherCsv(await file.text());
  if (parsed.rows.length === 0) {
    return {
      error:
        parsed.issues[0]?.message ?? "Le fichier CSV ne contient aucun ticket importable.",
    };
  }

  const orgPackages = await db
    .select({
      id: packages.id,
      durationValue: packages.durationValue,
      durationUnit: packages.durationUnit,
    })
    .from(packages)
    .where(eq(packages.orgId, session.orgId));

  const existing = await db
    .select({
      id: vouchers.id,
      username: vouchers.username,
      deletedAt: vouchers.deletedAt,
      useCase: vouchers.useCase,
    })
    .from(vouchers)
    .where(inArray(vouchers.username, parsed.rows.map((row) => row.username)));
  const existingByUsername = new Map(existing.map((voucher) => [voucher.username, voucher]));
  const candidates = parsed.rows.filter((row) => !existingByUsername.has(row.username));
  const inTrash = existing.filter((voucher) => voucher.deletedAt !== null).length;
  const alreadyTracked = existing.length - inTrash;
  const rowsByUsername = new Map(parsed.rows.map((row) => [row.username, row]));
  const archivedImported = existing.filter(
    (voucher) =>
      voucher.deletedAt !== null && isImportedVoucherUseCase(voucher.useCase) && rowsByUsername.has(voucher.username),
  );
  const unmatchedProfiles = candidates.filter(
    (row) => row.profileName && !matchPackageForProfile(row.profileName, orgPackages),
  ).length;

  // Un archivé importé qui revient dans un nouveau CSV est réactivé sans
  // recréer son username unique. On rattache aussi le routeur source si le
  // fichier vient d'une nouvelle zone. Aucun appel MikroTik n'est effectué.
  if (archivedImported.length > 0) {
    const archivedIds = archivedImported.map((voucher) => voucher.id);
    const existingLinks = await db
      .select({ voucherId: voucherRouters.voucherId, routerId: voucherRouters.routerId })
      .from(voucherRouters)
      .where(and(eq(voucherRouters.orgId, session.orgId), inArray(voucherRouters.voucherId, archivedIds)));
    const linked = new Set(existingLinks.map((link) => `${link.voucherId}:${link.routerId}`));
    const linksToAdd = archivedImported
      .filter((voucher) => !linked.has(`${voucher.id}:${router.id}`))
      .map((voucher) => {
        const row = rowsByUsername.get(voucher.username)!;
        return {
          orgId: session.orgId,
          voucherId: voucher.id,
          routerId: router.id,
          profileName: row.profileName,
          status: "PROVISIONED" as const,
        };
      });

    await db.transaction(async (tx) => {
      await tx
        .update(vouchers)
        .set({ deletedAt: null })
        .where(and(eq(vouchers.orgId, session.orgId), inArray(vouchers.id, archivedIds)));
      if (linksToAdd.length > 0) await tx.insert(voucherRouters).values(linksToAdd);
    });
    revalidatePath("/admin/vouchers");
  }

  if (candidates.length > 0) {
    const voucherRows = candidates.map((row) => ({
      id: randomUUID(),
      orgId: session.orgId,
      username: row.username,
      packageId: matchPackageForProfile(row.profileName, orgPackages)?.id ?? null,
      routerId: router.id,
      profileName: row.profileName,
      status: "PROVISIONED" as const,
      useCase: "Imported CSV",
      note: row.comment,
    }));
    const links = voucherRows.map((voucher) => ({
      orgId: session.orgId,
      voucherId: voucher.id,
      routerId: router.id,
      profileName: voucher.profileName,
      status: "PROVISIONED" as const,
    }));
    await db.transaction(async (tx) => {
      await tx.insert(vouchers).values(voucherRows);
      await tx.insert(voucherRouters).values(links);
    });
    revalidatePath("/admin/vouchers");
  }

  return {
    success: true,
    imported: candidates.length,
    restored: archivedImported.length,
    alreadyTracked,
    inTrash,
    invalidRows: parsed.issues.length,
    unmatchedProfiles,
  };
}

/**
 * Importe dans le SaaS les tickets générés directement dans MikHmon.
 *
 * MikHmon n'a pas de base propre : un « ticket » MikHmon EST un utilisateur
 * hotspot posé sur le routeur (`/ip/hotspot/user`), avec le profil de durée et,
 * après la 1ʳᵉ connexion, un commentaire « mmm/JJ/AAAA HH:MM:SS » = expiration.
 * On lit donc ces utilisateurs via le tunnel déjà utilisé pour la gestion (le
 * même chemin que reconcile.ts), et on enregistre en base ceux que le SaaS ne
 * suit pas encore. Aucune API MikHmon à ouvrir sur le conteneur.
 *
 * L'opération est idempotente :
 *   • username inconnu du SaaS  → nouveau voucher + lien(s) voucher_routers ;
 *   • username déjà en base mais pas rattaché à cette zone → on ajoute juste le
 *     lien voucher_routers (le ticket est « adopté » sur cette zone WiFi) ;
 *   • username déjà rattaché → ignoré.
 *
 * On saute les utilisateurs dynamiques (sessions mac-cookie, pas des tickets)
 * et ceux sans nom. Le forfait est rattaché quand le profil correspond à un
 * forfait de l'org ; l'expiration/le début sont déduits du commentaire MikHmon
 * exactement comme le fait le décompte partagé.
 */
export async function importMikhmonTickets(_prevState: unknown, formData: FormData) {
  const session = await requireAdminSession();
  if (!session) return { error: "Non authentifié." };

  const routerIds = formData
    .getAll("routerIds")
    .map((r) => String(r))
    .filter(Boolean);
  const note = String(formData.get("note") ?? "").trim() || null;

  if (routerIds.length === 0) return { error: "Sélectionnez au moins un routeur." };

  const db = getDb();
  const orgRouters = await db
    .select()
    .from(routers)
    .where(and(inArray(routers.id, routerIds), eq(routers.orgId, session.orgId)));
  if (orgRouters.length === 0) return { error: "Routeur introuvable." };

  // Les profils MikHmon sont rapprochés des forfaits avec la même normalisation
  // que l'import CSV (01-JOUR, 1 JOUR, 01-JOURS, etc.).
  const orgPackages = await db
    .select({
      id: packages.id,
      durationValue: packages.durationValue,
      durationUnit: packages.durationUnit,
    })
    .from(packages)
    .where(eq(packages.orgId, session.orgId));

  // Vouchers déjà connus (par nom) + liens (voucher, routeur) déjà posés, pour
  // ne rien recréer et savoir quels liens de zone manquent encore.
  const existing = await db
    .select({ id: vouchers.id, username: vouchers.username })
    .from(vouchers)
    .where(eq(vouchers.orgId, session.orgId));
  const voucherIdByName = new Map(existing.map((v) => [v.username, v.id]));
  const existingLinks = existing.length
    ? await db
        .select({ voucherId: voucherRouters.voucherId, routerId: voucherRouters.routerId })
        .from(voucherRouters)
        .where(eq(voucherRouters.orgId, session.orgId))
        .catch(() => [] as { voucherId: string; routerId: string }[])
    : [];
  const linkKey = (voucherId: string, routerId: string) => `${voucherId}:${routerId}`;
  const linkedPairs = new Set(existingLinks.map((l) => linkKey(l.voucherId, l.routerId)));

  // Utilisateurs lus, agrégés par nom : un même code peut vivre sur plusieurs
  // zones. On garde le profil et l'expiration la plus précoce (1ʳᵉ connexion).
  type Scanned = { profile: string | null; expiry: Wall | null; routerIds: string[] };
  const byName = new Map<string, Scanned>();
  const routerErrors: string[] = [];

  for (const router of orgRouters) {
    let client: RouterOSClient;
    try {
      client = await connectToRouter(router);
    } catch (e) {
      routerErrors.push(
        `${router.name} injoignable : ${e instanceof Error ? e.message : "connexion échouée"}`,
      );
      continue;
    }
    try {
      const users = await client
        .talk(["/ip/hotspot/user/print"])
        .catch(() => [] as Record<string, string>[]);
      for (const u of users) {
        const name = u["name"];
        // Pas de nom, ou session dynamique (mac-cookie / trial) : pas un ticket.
        if (!name || u["dynamic"] === "true") continue;
        const comment = u["comment"] ?? "";
        const expiry = comment ? parseExpiryComment(comment) : null;
        const profile = u["profile"] || null;
        const entry = byName.get(name);
        if (entry) {
          entry.routerIds.push(router.id);
          if (expiry && (!entry.expiry || wallKey(expiry) < wallKey(entry.expiry))) {
            entry.expiry = expiry;
          }
          if (!entry.profile && profile) entry.profile = profile;
        } else {
          byName.set(name, { profile, expiry, routerIds: [router.id] });
        }
      }
    } finally {
      client.close();
    }
  }

  // Répartition : nouveaux tickets à créer vs liens de zone à ajouter à un
  // voucher déjà connu vs déjà entièrement suivis (ignorés).
  const toCreate: { name: string; scanned: Scanned }[] = [];
  const linksToAdd: { voucherId: string; routerId: string }[] = [];
  let alreadyTracked = 0;
  for (const [name, scanned] of byName) {
    const knownId = voucherIdByName.get(name);
    if (knownId) {
      let added = false;
      for (const routerId of scanned.routerIds) {
        if (!linkedPairs.has(linkKey(knownId, routerId))) {
          linksToAdd.push({ voucherId: knownId, routerId });
          linkedPairs.add(linkKey(knownId, routerId));
          added = true;
        }
      }
      if (!added) alreadyTracked += 1;
    } else {
      toCreate.push({ name, scanned });
    }
  }

  const deferred = Math.max(0, toCreate.length - MAX_IMPORT_PER_RUN);
  const createBatch = toCreate.slice(0, MAX_IMPORT_PER_RUN);

  let imported = 0;
  let adopted = 0;
  if (createBatch.length > 0 || linksToAdd.length > 0) {
    // On pré-génère les UUID et on regroupe tous les INSERT dans une
    // transaction atomique.
    let voucherRowsToInsert: (typeof vouchers.$inferInsert)[] = [];
    let newLinksToInsert: (typeof voucherRouters.$inferInsert)[] = [];

    if (createBatch.length > 0) {
      const newVouchers = createBatch.map(({ name, scanned }) => {
        const profileName = scanned.profile;
        const expiresAt = scanned.expiry ? wallToDate(scanned.expiry) : null;
        // début = expiration − durée (déduite du profil), comme reconcile.
        const pkg = durationFromProfileName(profileName);
        const firstLoginAt =
          expiresAt && pkg ? new Date(expiresAt.getTime() - durationToMs(pkg)) : null;
        return {
          scanned,
          row: {
            id: randomUUID(),
            orgId: session.orgId,
            username: name,
            packageId: matchPackageForProfile(profileName, orgPackages)?.id ?? null,
            routerId: scanned.routerIds[0],
            profileName,
            status: "PROVISIONED" as const,
            firstLoginAt,
            expiresAt,
            useCase: "Imported" as const,
            note,
          },
        };
      });
      imported = newVouchers.length;
      voucherRowsToInsert = newVouchers.map((v) => v.row);

      newLinksToInsert = newVouchers.flatMap(({ row, scanned }) =>
        scanned.routerIds.map((routerId) => ({
          orgId: session.orgId,
          voucherId: row.id,
          routerId,
          profileName: scanned.profile ?? null,
          status: "PROVISIONED" as const,
        })),
      );
    }

    const adoptedLinks =
      linksToAdd.length > 0
        ? linksToAdd.map((l) => ({
            orgId: session.orgId,
            voucherId: l.voucherId,
            routerId: l.routerId,
            status: "PROVISIONED" as const,
          }))
        : [];
    adopted = adoptedLinks.length;

    if (voucherRowsToInsert.length > 0 || newLinksToInsert.length > 0 || adoptedLinks.length > 0) {
      await db.transaction(async (tx) => {
        if (voucherRowsToInsert.length > 0) await tx.insert(vouchers).values(voucherRowsToInsert);
        if (newLinksToInsert.length > 0) await tx.insert(voucherRouters).values(newLinksToInsert);
        if (adoptedLinks.length > 0) await tx.insert(voucherRouters).values(adoptedLinks);
      });
    }
    revalidatePath("/admin/vouchers");
  }

  if (imported === 0 && adopted === 0 && routerErrors.length > 0) {
    return { error: `Aucun ticket importé. ${routerErrors.slice(0, 3).join(" ; ")}` };
  }
  return {
    success: true,
    imported,
    adopted,
    alreadyTracked,
    deferred,
    scanned: byName.size,
    routerErrors: routerErrors.slice(0, 3),
  };
}
