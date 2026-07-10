"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
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
    await db.transaction(async (tx) => {
      const inserted = await tx
        .insert(vouchers)
        .values(
          created.map((code) => ({
            orgId: session.orgId,
            username: code,
            packageId: pkg.id,
            routerId: createdOn.get(code)![0], // routeur principal
            profileName,
            status: "PROVISIONED" as const,
            useCase: "Batch Create",
            note,
          })),
        )
        .returning({ id: vouchers.id, username: vouchers.username });

      const links = inserted.flatMap((v) =>
        (createdOn.get(v.username) ?? []).map((routerId) => ({
          orgId: session.orgId,
          voucherId: v.id,
          routerId,
          profileName,
          status: "PROVISIONED" as const,
        })),
      );
      if (links.length > 0) await tx.insert(voucherRouters).values(links);
    });
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
