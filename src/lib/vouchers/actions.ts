"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
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

const CODE_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";

function randomCode(length = 6) {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

// Préfixe de lot : uniquement des minuscules/chiffres (mêmes contraintes que
// les codes hotspot), 10 caractères max. On nettoie silencieusement plutôt que
// de rejeter, pour ne pas bloquer l'admin sur une majuscule ou un tiret.
function sanitizePrefix(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10);
}

/** Retire un utilisateur hotspot (et sa session active) d'un routeur. Best-effort. */
async function removeHotspotUser(client: RouterOSClient, name: string) {
  const users = await client
    .talk(["/ip/hotspot/user/print", `?name=${name}`])
    .catch(() => [] as Record<string, string>[]);
  for (const u of users) {
    if (u[".id"]) {
      await client
        .talk(["/ip/hotspot/user/remove", `=.id=${u[".id"]}`])
        .catch(() => {});
    }
  }
  const active = await client
    .talk(["/ip/hotspot/active/print", `?user=${name}`])
    .catch(() => [] as Record<string, string>[]);
  for (const a of active) {
    if (a[".id"]) {
      await client
        .talk(["/ip/hotspot/active/remove", `=.id=${a[".id"]}`])
        .catch(() => {});
    }
  }
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
    // neon-http ne gère pas les transactions interactives. On pré-génère les
    // UUID des vouchers pour construire les liens de zone sans dépendre d'un
    // RETURNING, puis db.batch() exécute les deux INSERT de façon atomique.
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
      await db.batch([
        db.insert(vouchers).values(voucherRows),
        db.insert(voucherRouters).values(links),
      ]);
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
 * Supprime des vouchers : retire l'utilisateur hotspot sur CHAQUE routeur où
 * il existe (best-effort), puis efface les lignes en base. Sert à la fois pour
 * la suppression individuelle (un id) et globale du lot (tous les ids).
 */
export async function deleteVouchers(ids: string[]) {
  const session = await requireAdminSession();
  if (!session) return { error: "Non authentifié." };
  if (!Array.isArray(ids) || ids.length === 0) return { error: "Aucun voucher." };

  const db = getDb();

  const rows = await db
    .select({ id: vouchers.id, username: vouchers.username, routerId: vouchers.routerId })
    .from(vouchers)
    .where(and(inArray(vouchers.id, ids), eq(vouchers.orgId, session.orgId)));
  if (rows.length === 0) return { error: "Voucher(s) introuvable(s)." };

  const usernameById = new Map(rows.map((r) => [r.id, r.username]));
  const validIds = rows.map((r) => r.id);

  // Table de liaison optionnelle : si elle n'existe pas encore (migration non
  // appliquée), on retombe sur vouchers.routerId — la suppression marche quand même.
  const links = await db
    .select({ voucherId: voucherRouters.voucherId, routerId: voucherRouters.routerId })
    .from(voucherRouters)
    .where(inArray(voucherRouters.voucherId, validIds))
    .catch(() => [] as { voucherId: string; routerId: string }[]);

  // routerId → set de codes à retirer. Priorité à la table de liaison ;
  // fallback sur vouchers.routerId pour les anciens vouchers mono-routeur.
  const byRouter = new Map<string, Set<string>>();
  const covered = new Set<string>();
  for (const l of links) {
    const name = usernameById.get(l.voucherId);
    if (!name) continue;
    covered.add(l.voucherId);
    const set = byRouter.get(l.routerId) ?? new Set<string>();
    set.add(name);
    byRouter.set(l.routerId, set);
  }
  for (const r of rows) {
    if (covered.has(r.id) || !r.routerId) continue;
    const set = byRouter.get(r.routerId) ?? new Set<string>();
    set.add(r.username);
    byRouter.set(r.routerId, set);
  }

  // Retrait sur les routeurs (une connexion par routeur). Un routeur
  // injoignable ne bloque pas la suppression en base : le user disparaîtra de
  // toute façon à l'expiration côté routeur, et l'admin veut le retirer du portail.
  const routerIds = [...byRouter.keys()];
  const routerRows = routerIds.length
    ? await db
        .select()
        .from(routers)
        .where(and(inArray(routers.id, routerIds), eq(routers.orgId, session.orgId)))
    : [];
  for (const router of routerRows) {
    const names = byRouter.get(router.id);
    if (!names || names.size === 0) continue;
    let client: RouterOSClient;
    try {
      client = await connectToRouter(router);
    } catch {
      continue;
    }
    try {
      for (const name of names) await removeHotspotUser(client, name);
    } finally {
      client.close();
    }
  }

  await db
    .delete(vouchers)
    .where(and(inArray(vouchers.id, validIds), eq(vouchers.orgId, session.orgId)));
  revalidatePath("/admin/vouchers");
  return { success: true, deleted: validIds.length };
}

// Plafond d'import par passage : un routeur peut porter des milliers
// d'utilisateurs hotspot (historique MikHmon). On borne l'insert pour ne pas
// enfler une transaction unique ; le surplus est signalé et récupéré au
// prochain import (les tickets déjà importés sont sautés, donc l'opération est
// idempotente et progresse à chaque passage).
const MAX_IMPORT_PER_RUN = 2000;

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

  // Profil hotspot → forfait de l'org, pour rattacher les tickets importés au
  // bon forfait quand la durée correspond (premier forfait gagnant).
  const orgPackages = await db
    .select({
      id: packages.id,
      durationValue: packages.durationValue,
      durationUnit: packages.durationUnit,
    })
    .from(packages)
    .where(eq(packages.orgId, session.orgId));
  const packageIdByProfile = new Map<string, string>();
  for (const p of orgPackages) {
    const profile = packageProfileName(p.durationValue, p.durationUnit);
    if (profile && !packageIdByProfile.has(profile)) packageIdByProfile.set(profile, p.id);
  }

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
    // neon-http : pas de transaction interactive. On pré-génère les UUID et on
    // regroupe tous les INSERT dans un db.batch() atomique (un seul aller-retour).
    const ops: BatchItem<"pg">[] = [];

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
            packageId: (profileName && packageIdByProfile.get(profileName)) || null,
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
      ops.push(db.insert(vouchers).values(newVouchers.map((v) => v.row)));

      const newLinks = newVouchers.flatMap(({ row, scanned }) =>
        scanned.routerIds.map((routerId) => ({
          orgId: session.orgId,
          voucherId: row.id,
          routerId,
          profileName: scanned.profile ?? null,
          status: "PROVISIONED" as const,
        })),
      );
      if (newLinks.length > 0) ops.push(db.insert(voucherRouters).values(newLinks));
    }

    if (linksToAdd.length > 0) {
      ops.push(
        db.insert(voucherRouters).values(
          linksToAdd.map((l) => ({
            orgId: session.orgId,
            voucherId: l.voucherId,
            routerId: l.routerId,
            status: "PROVISIONED" as const,
          })),
        ),
      );
      adopted = linksToAdd.length;
    }

    if (ops.length > 0) {
      await db.batch(ops as [BatchItem<"pg">, ...BatchItem<"pg">[]]);
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
