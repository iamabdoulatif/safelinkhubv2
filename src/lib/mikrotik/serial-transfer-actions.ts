"use server";

// Transfert superadmin d'un MikroTik d'un compte vers un autre.
//
// POURQUOI CETTE FONCTIONNALITÉ EXISTE : le verrou de numéro de série empêche
// qu'un boîtier rattaché à un compte soit remis en service sur un autre — c'est
// ce qui protège les appareils des clients. Mais un transfert LÉGITIME existe
// aussi : revente, changement d'exploitant, boîtier repris entre deux
// organisations. Jusqu'ici la libération du verrou n'était exposée nulle part
// dans l'interface, et le routeur restait bloqué hors ligne sans que le motif
// remonte à l'écran.

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { organizations, routers, routerSerialLocks, vpnAccessAuditEvents } from "@/lib/db/schema";
import { getSession, isSuperAdmin } from "@/lib/auth/session";
import type { RouterOSClient } from "./client";
import { connectToRouter } from "./router-sync";
import { readRouterSerial, transferRouterSerialLock } from "./router-serial-lock";

export type SerialLockInspection =
  | { error: string }
  | {
      success: true;
      serial: string;
      /** Verrou actif détenu AILLEURS — la raison du hors-ligne. */
      blocked: boolean;
      holder: { routerName: string; orgName: string; lockedAt: string } | null;
    };

/**
 * Pourquoi ce routeur est-il gardé hors ligne ? Lecture seule.
 *
 * Lit le numéro de série sur l'appareil puis interroge la table des verrous.
 * Le routeur est joignable par définition dans ce scénario : c'est justement
 * parce que la synchro a réussi à lire son SN qu'elle a pu détecter le conflit.
 */
export async function inspectRouterSerialLock(routerId: string): Promise<SerialLockInspection> {
  const session = await getSession();
  if (!session || !isSuperAdmin(session.role)) return { error: "Réservé au superadmin." };

  const db = getDb();
  const [router] = await db.select().from(routers).where(eq(routers.id, routerId)).limit(1);
  if (!router) return { error: "Routeur introuvable." };

  let client: RouterOSClient;
  try {
    client = await connectToRouter(router);
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? `Routeur injoignable : ${err.message}. Il doit répondre pour lire son numéro de série.`
          : "Routeur injoignable.",
    };
  }

  let serial: string | null;
  try {
    serial = await readRouterSerial(client);
  } finally {
    client.close();
  }
  if (!serial) {
    return { error: "Numéro de série illisible sur cet appareil — aucun verrou ne peut le viser." };
  }

  const [lock] = await db
    .select()
    .from(routerSerialLocks)
    .where(eq(routerSerialLocks.serialNumber, serial))
    .limit(1);

  if (!lock || lock.releasedAt !== null || lock.routerId === routerId) {
    return { success: true, serial, blocked: false, holder: null };
  }

  const [holderRouter] = lock.routerId
    ? await db.select({ name: routers.name }).from(routers).where(eq(routers.id, lock.routerId)).limit(1)
    : [];
  const [holderOrg] = lock.orgId
    ? await db
        .select({ name: organizations.name })
        .from(organizations)
        .where(eq(organizations.id, lock.orgId))
        .limit(1)
    : [];

  return {
    success: true,
    serial,
    blocked: true,
    holder: {
      routerName: holderRouter?.name ?? "(routeur supprimé)",
      orgName: holderOrg?.name ?? "(organisation supprimée)",
      lockedAt: lock.lockedAt.toISOString(),
    },
  };
}

/**
 * Rattache le boîtier au routeur COURANT, en le détachant du compte qui le
 * détenait.
 *
 * La cible est le routeur qu'on regarde, jamais un identifiant saisi : on ne
 * peut pas se tromper de destination, et il n'y a pas de sélecteur listant les
 * routeurs de tous les comptes à traverser.
 *
 * Tracé DES DEUX CÔTÉS dans le journal d'audit : une entrée « sortie » sur le
 * compte qui perd l'appareil, une entrée « entrée » sur celui qui le reçoit,
 * toutes deux portant l'auteur. Un transfert entre comptes de tiers ne doit pas
 * pouvoir se faire sans laisser de trace chez les deux.
 */
export async function transferRouterSerialToThisRouter(
  routerId: string,
): Promise<{ error: string } | { success: true; summary: string }> {
  const session = await getSession();
  if (!session || !isSuperAdmin(session.role)) return { error: "Réservé au superadmin." };

  const inspection = await inspectRouterSerialLock(routerId);
  if ("error" in inspection) return inspection;
  if (!inspection.blocked) {
    return { error: "Ce routeur n'est bloqué par aucun verrou détenu ailleurs." };
  }

  const db = getDb();
  const [router] = await db.select().from(routers).where(eq(routers.id, routerId)).limit(1);
  if (!router) return { error: "Routeur introuvable." };

  const result = await transferRouterSerialLock(inspection.serial, {
    routerId,
    orgId: router.orgId,
  });
  if (!result.ok) return { error: result.error };

  // Trace côté compte qui PERD l'appareil.
  if (result.transfer.from?.routerId && result.transfer.from.orgId) {
    await db
      .insert(vpnAccessAuditEvents)
      .values({
        actorUserId: session.userId,
        orgId: result.transfer.from.orgId,
        routerId: result.transfer.from.routerId,
        action: `serial_transferred_out:${inspection.serial}`,
      })
      .catch(() => {});
  }
  // Trace côté compte qui le REÇOIT.
  await db
    .insert(vpnAccessAuditEvents)
    .values({
      actorUserId: session.userId,
      orgId: router.orgId,
      routerId,
      action: `serial_transferred_in:${inspection.serial}`,
    })
    .catch(() => {});

  revalidatePath(`/admin/router/${routerId}`);
  revalidatePath("/admin/router");

  return {
    success: true,
    summary:
      `Boîtier ${inspection.serial} rattaché à ${router.name}, retiré de ` +
      `${inspection.holder?.routerName} (${inspection.holder?.orgName}). ` +
      `Il repassera en ligne à la prochaine synchronisation ; l'ancien routeur, lui, sera désormais gardé hors ligne.`,
  };
}
