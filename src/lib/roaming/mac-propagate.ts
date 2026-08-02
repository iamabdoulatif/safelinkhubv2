import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  vouchers,
  roamingGroupRouters,
  roamingProfiles,
  routers,
} from "@/lib/db/schema";
import { connectToRouter } from "@/lib/mikrotik/router-sync";
import type { RouterOSClient } from "@/lib/mikrotik/client";
import {
  parseExpiryComment,
  formatExpiryComment,
  dateToWall,
} from "@/lib/vouchers/reconcile";
import { durationToMs, type PackageDuration } from "@/lib/vouchers/expiry";

/** Normalise un MAC vers AA:BB:CC:DD:EE:FF, ou "" si invalide. */
function normalizeMac(raw: string): string {
  const hex = (raw ?? "").replace(/[^0-9a-fA-F]/g, "").toUpperCase();
  if (hex.length !== 12) return "";
  return (hex.match(/.{2}/g) ?? []).join(":");
}

export type PropagateResult = { ok: boolean; reason?: string; boundOn?: number };

/**
 * Auto-login inter-zones (roaming, 1 appareil / code).
 *
 * Déclenché par le webhook `/api/roaming/seen` quand un code se connecte quelque
 * part. On :
 *   1. confirme que le voucher est bien un ticket roaming de l'org du routeur ;
 *   2. VÉRIFIE EN LIVE sur le routeur émetteur que la session (user, mac) existe
 *      vraiment (anti-usurpation : un POST forgé ne lie rien) ;
 *   3. single-device : si le code est déjà lié à un AUTRE MAC, on s'arrête ;
 *   4. sinon, sur chaque routeur du groupe : lie le code au MAC (anti-partage)
 *      et crée un utilisateur `name=<MAC>` (même profil + même expiration) qui,
 *      avec `login-by=mac`, auto-logue l'appareil en zone voisine sans re-saisie.
 *
 * Idempotent et best-effort par routeur : un routeur injoignable est sauté, les
 * autres avancent. Ne lève jamais (appelé en tâche de fond).
 */
export async function propagateRoamingMac(input: {
  reporterRouterId: string;
  username: string;
  mac: string;
}): Promise<PropagateResult> {
  const mac = normalizeMac(input.mac);
  const username = (input.username ?? "").trim();
  if (!mac || !username) return { ok: false, reason: "invalid-input" };

  const db = getDb();

  const [reporter] = await db
    .select()
    .from(routers)
    .where(eq(routers.id, input.reporterRouterId))
    .limit(1);
  if (!reporter) return { ok: false, reason: "unknown-router" };

  // Ticket roaming de l'org du routeur émetteur (jamais cross-org).
  const [voucher] = await db
    .select({
      id: vouchers.id,
      roamingGroupId: vouchers.roamingGroupId,
      profileName: vouchers.profileName,
      durationValue: roamingProfiles.durationValue,
      durationUnit: roamingProfiles.durationUnit,
    })
    .from(vouchers)
    .leftJoin(roamingProfiles, eq(vouchers.roamingProfileId, roamingProfiles.id))
    .where(and(eq(vouchers.username, username), eq(vouchers.orgId, reporter.orgId)))
    .limit(1);
  if (!voucher || !voucher.roamingGroupId || !voucher.profileName) {
    return { ok: false, reason: "not-roaming" };
  }

  const groupRouters = await db
    .select({ router: routers })
    .from(roamingGroupRouters)
    .innerJoin(routers, eq(roamingGroupRouters.routerId, routers.id))
    .where(
      and(
        eq(roamingGroupRouters.groupId, voucher.roamingGroupId),
        eq(roamingGroupRouters.orgId, reporter.orgId),
      ),
    );
  if (groupRouters.length === 0) return { ok: false, reason: "empty-group" };

  // ── Anti-usurpation : la session (user, mac) doit exister sur l'émetteur.
  let codeUserComment = "";
  let alreadyBoundMac = "";
  let reporterClient: RouterOSClient;
  try {
    reporterClient = await connectToRouter(reporter);
  } catch {
    return { ok: false, reason: "reporter-unreachable" };
  }
  try {
    const active = await reporterClient
      .talk(["/ip/hotspot/active/print", `?user=${username}`])
      .catch(() => [] as Record<string, string>[]);
    const sessionMatches = active.some((a) => normalizeMac(a["mac-address"] ?? "") === mac);
    if (!sessionMatches) return { ok: false, reason: "session-not-found" };

    const codeUsers = await reporterClient
      .talk(["/ip/hotspot/user/print", `?name=${username}`])
      .catch(() => [] as Record<string, string>[]);
    codeUserComment = codeUsers[0]?.["comment"] ?? "";
    alreadyBoundMac = normalizeMac(codeUsers[0]?.["mac-address"] ?? "");
  } finally {
    reporterClient.close();
  }

  // Single-device : code déjà lié à un autre appareil → on ne rebascule pas.
  if (alreadyBoundMac && alreadyBoundMac !== mac) {
    return { ok: false, reason: "bound-elsewhere" };
  }

  // Commentaire du user MAC = l'expiration du code si déjà stampée, sinon on la
  // calcule (début maintenant + durée) au format MikHmon → le sweep par profil
  // le supprimera à échéance (pas d'utilisateur MAC orphelin).
  const duration: PackageDuration | null =
    voucher.durationValue && voucher.durationUnit
      ? {
          durationValue: voucher.durationValue,
          durationUnit: voucher.durationUnit,
          billingStartsOn: "Upon First Use",
        }
      : null;
  const macComment = (() => {
    if (parseExpiryComment(codeUserComment)) return codeUserComment;
    if (duration) return formatExpiryComment(dateToWall(new Date(Date.now() + durationToMs(duration))));
    return codeUserComment || `roam ${username}`;
  })();

  const profileName = voucher.profileName;
  let boundOn = 0;
  for (const { router } of groupRouters) {
    let client: RouterOSClient;
    try {
      client = await connectToRouter(router);
    } catch {
      continue; // routeur injoignable → sauté, les autres avancent
    }
    try {
      // (a) Lier le code au MAC (anti-partage single-device), idempotent.
      const codeUsers = await client
        .talk(["/ip/hotspot/user/print", `?name=${username}`])
        .catch(() => [] as Record<string, string>[]);
      const codeId = codeUsers[0]?.[".id"];
      if (codeId && normalizeMac(codeUsers[0]["mac-address"] ?? "") !== mac) {
        await client
          .talk(["/ip/hotspot/user/set", `=.id=${codeId}`, `=mac-address=${mac}`])
          .catch(() => {});
      }

      // (b) User auto-login MAC (même profil + même expiration), idempotent.
      const macUsers = await client
        .talk(["/ip/hotspot/user/print", `?name=${mac}`])
        .catch(() => [] as Record<string, string>[]);
      if (macUsers.length === 0) {
        await client
          .talk([
            "/ip/hotspot/user/add",
            `=name=${mac}`,
            `=mac-address=${mac}`,
            `=password=${mac}`,
            `=profile=${profileName}`,
            `=comment=${macComment}`,
          ])
          .catch(() => {});
      }
      boundOn += 1;
    } finally {
      client.close();
    }
  }

  return { ok: true, boundOn };
}
