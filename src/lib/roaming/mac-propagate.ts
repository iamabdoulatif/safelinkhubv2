import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  roamingDeviceBindingRouters,
  roamingDeviceBindings,
  roamingGroupRouters,
  roamingProfiles,
  routers,
  vouchers,
} from "@/lib/db/schema";
import { connectToRouter } from "@/lib/mikrotik/router-sync";
import type { RouterOSClient } from "@/lib/mikrotik/client";
import {
  parseExpiryComment,
  formatExpiryComment,
  dateToWall,
} from "@/lib/vouchers/reconcile";
import { durationToMs, type PackageDuration } from "@/lib/vouchers/expiry";
import { isUnlimitedUnit } from "@/lib/mikrotik/package-voucher-profile";
import { normalizeRoamingMac } from "./device-binding";

export type PropagateResult = { ok: boolean; reason?: string; boundOn?: number; bindingId?: string };

type DeviceMaterialization = {
  username: string;
  mac: string;
  profileName: string;
  macComment?: string;
  resolveMacComment?: (codeUserComment: string) => string;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 500) : "Erreur RouterOS inconnue.";
}

function expiryDuration(durationValue: number | null, durationUnit: string | null): PackageDuration | null {
  return !isUnlimitedUnit(durationUnit ?? "") && durationValue && durationUnit
    ? { durationValue, durationUnit, billingStartsOn: "Upon First Use" }
    : null;
}

function macCommentFor(codeUserComment: string, duration: PackageDuration | null, username: string) {
  if (parseExpiryComment(codeUserComment)) return codeUserComment;
  if (duration) return formatExpiryComment(dateToWall(new Date(Date.now() + durationToMs(duration))));
  return codeUserComment || `roam ${username}`;
}

/**
 * Matérialise une liaison déjà approuvée sur UN MikroTik. Cette unité ne touche
 * pas à la base et se teste donc avec un client RouterOS réel ou simulé.
 */
export async function materializeRoamingDeviceOnRouter(
  client: RouterOSClient,
  input: DeviceMaterialization,
) {
  const codeUsers = await client.talk(["/ip/hotspot/user/print", `?name=${input.username}`]);
  const codeUser = codeUsers[0];
  const codeId = codeUser?.[".id"];
  if (!codeId) throw new Error(`Le compte « ${input.username} » est absent de cette zone.`);

  const mac = normalizeRoamingMac(input.mac);
  if (!mac) throw new Error("Adresse MAC invalide.");
  if (normalizeRoamingMac(codeUser["mac-address"] ?? "") !== mac) {
    await client.talk(["/ip/hotspot/user/set", `=.id=${codeId}`, `=mac-address=${mac}`]);
  }

  const comment = input.resolveMacComment?.(codeUser.comment ?? "") ?? input.macComment ?? `roam ${input.username}`;
  const macUsers = await client.talk(["/ip/hotspot/user/print", `?name=${mac}`]);
  const companion = macUsers[0];
  if (!companion?.[".id"]) {
    await client.talk([
      "/ip/hotspot/user/add",
      `=name=${mac}`,
      `=mac-address=${mac}`,
      `=password=${mac}`,
      `=profile=${input.profileName}`,
      `=comment=${comment}`,
    ]);
    return;
  }

  await client.talk([
    "/ip/hotspot/user/set",
    `=.id=${companion[".id"]}`,
    `=mac-address=${mac}`,
    `=password=${mac}`,
    `=profile=${input.profileName}`,
    `=comment=${comment}`,
  ]);
}

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

async function markBindingRouter(
  bindingId: string,
  routerId: string,
  state: "PENDING" | "SYNCED" | "ERROR",
  patch: { lastError?: string | null; syncedAt?: Date | null } = {},
) {
  const db = getDb();
  const now = new Date();
  await db
    .insert(roamingDeviceBindingRouters)
    .values({ bindingId, routerId, status: "PENDING" })
    .onConflictDoNothing();
  await db
    .update(roamingDeviceBindingRouters)
    .set({
      status: state,
      attempts: sql`${roamingDeviceBindingRouters.attempts} + 1`,
      lastAttemptAt: now,
      lastError: patch.lastError ?? null,
      syncedAt: patch.syncedAt ?? (state === "SYNCED" ? now : null),
    })
    .where(
      and(
        eq(roamingDeviceBindingRouters.bindingId, bindingId),
        eq(roamingDeviceBindingRouters.routerId, routerId),
      ),
    );
}

/**
 * Réplique une liaison durable depuis la base vers une ou toutes les zones du
 * groupe. Aucune session client n'est requise ici : c'est ce qui rend possible
 * la reprise quand un MikroTik revient en ligne après le départ du client.
 */
export async function syncRoamingDeviceBinding(input: {
  bindingId: string;
  onlyRouterId?: string;
}): Promise<PropagateResult> {
  const db = getDb();
  const [binding] = await db
    .select({
      id: roamingDeviceBindings.id,
      orgId: roamingDeviceBindings.orgId,
      macAddress: roamingDeviceBindings.macAddress,
      username: vouchers.username,
      groupId: vouchers.roamingGroupId,
      profileName: vouchers.profileName,
      durationValue: roamingProfiles.durationValue,
      durationUnit: roamingProfiles.durationUnit,
    })
    .from(roamingDeviceBindings)
    .innerJoin(vouchers, eq(roamingDeviceBindings.voucherId, vouchers.id))
    .leftJoin(roamingProfiles, eq(vouchers.roamingProfileId, roamingProfiles.id))
    .where(and(eq(roamingDeviceBindings.id, input.bindingId), isNull(vouchers.deletedAt)))
    .limit(1);
  if (!binding || !binding.groupId || !binding.profileName) {
    return { ok: false, reason: "binding-not-found" };
  }

  const allTargets = await loadGroupRouters(binding.orgId, binding.groupId);
  const targets = input.onlyRouterId
    ? allTargets.filter(({ router }) => router.id === input.onlyRouterId)
    : allTargets;
  if (targets.length === 0) return { ok: false, reason: "empty-group" };

  await db
    .insert(roamingDeviceBindingRouters)
    .values(targets.map(({ router }) => ({ bindingId: binding.id, routerId: router.id, status: "PENDING" as const })))
    .onConflictDoNothing();

  const duration = expiryDuration(binding.durationValue, binding.durationUnit);
  let boundOn = 0;
  for (const { router } of targets) {
    let client: RouterOSClient;
    try {
      client = await connectToRouter(router);
    } catch (error) {
      await markBindingRouter(binding.id, router.id, "PENDING", { lastError: errorMessage(error) });
      continue;
    }

    try {
      await materializeRoamingDeviceOnRouter(client, {
        username: binding.username,
        mac: binding.macAddress,
        profileName: binding.profileName,
        resolveMacComment: (codeUserComment) => macCommentFor(codeUserComment, duration, binding.username),
      });
      await markBindingRouter(binding.id, router.id, "SYNCED");
      boundOn += 1;
    } catch (error) {
      await markBindingRouter(binding.id, router.id, "ERROR", { lastError: errorMessage(error) });
    } finally {
      client.close();
    }
  }

  return { ok: true, boundOn, bindingId: binding.id };
}

/**
 * Vérifie la première connexion sur le routeur émetteur puis crée/relit la
 * liaison MAC canonique. C'est le seul chemin qui accepte une nouvelle MAC.
 */
export async function confirmAndSyncRoamingDevice(input: {
  reporterRouterId: string;
  username: string;
  mac: string;
}): Promise<PropagateResult> {
  const mac = normalizeRoamingMac(input.mac);
  const username = (input.username ?? "").trim();
  if (!mac || !username) return { ok: false, reason: "invalid-input" };

  const db = getDb();
  const [reporter] = await db.select().from(routers).where(eq(routers.id, input.reporterRouterId)).limit(1);
  if (!reporter) return { ok: false, reason: "unknown-router" };

  const [voucher] = await db
    .select({ id: vouchers.id, groupId: vouchers.roamingGroupId, profileName: vouchers.profileName })
    .from(vouchers)
    .where(
      and(
        eq(vouchers.username, username),
        eq(vouchers.orgId, reporter.orgId),
        isNull(vouchers.deletedAt),
      ),
    )
    .limit(1);
  if (!voucher?.groupId || !voucher.profileName) return { ok: false, reason: "not-roaming" };

  let reporterClient: RouterOSClient;
  try {
    reporterClient = await connectToRouter(reporter);
  } catch {
    return { ok: false, reason: "reporter-unreachable" };
  }
  try {
    const active = await reporterClient.talk(["/ip/hotspot/active/print", `?user=${username}`]);
    if (!active.some((session) => normalizeRoamingMac(session["mac-address"] ?? "") === mac)) {
      return { ok: false, reason: "session-not-found" };
    }
    const codeUsers = await reporterClient.talk(["/ip/hotspot/user/print", `?name=${username}`]);
    const alreadyBoundMac = normalizeRoamingMac(codeUsers[0]?.["mac-address"] ?? "");
    if (alreadyBoundMac && alreadyBoundMac !== mac) return { ok: false, reason: "bound-elsewhere" };
  } finally {
    reporterClient.close();
  }

  const [existing] = await db
    .select({ id: roamingDeviceBindings.id, macAddress: roamingDeviceBindings.macAddress })
    .from(roamingDeviceBindings)
    .where(eq(roamingDeviceBindings.voucherId, voucher.id))
    .limit(1);
  if (existing && existing.macAddress !== mac) return { ok: false, reason: "bound-elsewhere" };

  if (!existing) {
    await db
      .insert(roamingDeviceBindings)
      .values({ orgId: reporter.orgId, voucherId: voucher.id, macAddress: mac })
      .onConflictDoNothing();
  }
  const [binding] = await db
    .select({ id: roamingDeviceBindings.id, macAddress: roamingDeviceBindings.macAddress })
    .from(roamingDeviceBindings)
    .where(eq(roamingDeviceBindings.voucherId, voucher.id))
    .limit(1);
  if (!binding) return { ok: false, reason: "binding-not-created" };
  if (binding.macAddress !== mac) return { ok: false, reason: "bound-elsewhere" };

  return syncRoamingDeviceBinding({ bindingId: binding.id });
}

// Compatibilité du webhook existant : il appelle le chemin qui vérifie la
// session avant d'autoriser le premier appareil.
export const propagateRoamingMac = confirmAndSyncRoamingDevice;

export async function loadPendingRoamingBindings(routerId: string, limit = 50) {
  const db = getDb();
  return db
    .select({ id: roamingDeviceBindings.id })
    .from(roamingDeviceBindingRouters)
    .innerJoin(roamingDeviceBindings, eq(roamingDeviceBindingRouters.bindingId, roamingDeviceBindings.id))
    .innerJoin(vouchers, eq(roamingDeviceBindings.voucherId, vouchers.id))
    .where(
      and(
        eq(roamingDeviceBindingRouters.routerId, routerId),
        inArray(roamingDeviceBindingRouters.status, ["PENDING", "ERROR"]),
        isNull(vouchers.deletedAt),
      ),
    )
    .limit(limit);
}
