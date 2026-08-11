// Verrou anti-abus par numéro de série RouterOS. Un MikroTik (par SN) est
// rattaché au 1er ORG qui le met en service (auto-setup OU install VPN/OpenVPN
// OU liaison — armé au sync, voir enforceRouterSerialOnSync) ; toute tentative
// de le (re)configurer/mettre en service depuis un AUTRE org est refusée, sauf
// réinitialisation superadmin. Module serveur uniquement.

import type { RouterOSClient } from "./client";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { routerSerialLocks } from "@/lib/db/schema";

/** Lit le numéro de série du routeur (/system/routerboard). null si indisponible. */
export async function readRouterSerial(client: RouterOSClient, timeoutMs = 20000): Promise<string | null> {
  const [board] = await client
    .talk(["/system/routerboard/print"], timeoutMs)
    .catch(() => [] as Record<string, string>[]);
  const sn = (board?.["serial-number"] ?? "").trim();
  return sn || null;
}

export type SerialLockResult =
  | { ok: true; serial: string | null }
  | { ok: false; error: string; serial: string };

/**
 * Vérifie que le routeur peut être mis en service, PUIS réserve son SN.
 * - SN illisible (rare, hors RouterBOARD) → on autorise sans verrou (best-effort).
 * - SN déjà verrouillé par le MÊME org (ou verrou libéré) → on autorise (re-run
 *   légitime, même si c'est un autre routeur/slot du même compte).
 * - SN verrouillé par un AUTRE org, non libéré → REFUS (sauf `force`).
 * - `force` (superadmin) : jamais de refus — le verrou est TRANSFÉRÉ au routeur
 *   courant. Le superadmin peut donc (re)configurer n'importe quel MikroTik
 *   autant de fois qu'il veut.
 * Idempotent : réserve le SN pour ce routeur si libre.
 */
export async function reserveRouterSerial(
  client: RouterOSClient,
  routerId: string,
  orgId: string,
  opts?: { force?: boolean },
): Promise<SerialLockResult> {
  const serial = await readRouterSerial(client);
  if (!serial) return { ok: true, serial: null }; // pas de SN → pas de verrou possible

  const db = getDb();
  const [existing] = await db
    .select()
    .from(routerSerialLocks)
    .where(eq(routerSerialLocks.serialNumber, serial))
    .limit(1);

  if (existing) {
    const active = existing.releasedAt === null;
    if (active && existing.orgId !== orgId && !opts?.force) {
      return {
        ok: false,
        serial,
        error: `Ce MikroTik (série ${serial}) est déjà rattaché à un autre compte. Contactez le support pour le réinitialiser.`,
      };
    }
    // Même routeur (re-run), verrou libéré, OU forçage superadmin → on (ré-)arme
    // le verrou pour ce routeur (transfert au routeur courant si forçage).
    await db
      .update(routerSerialLocks)
      .set({ routerId, orgId, releasedAt: null, releasedBy: null, lockedAt: new Date() })
      .where(eq(routerSerialLocks.id, existing.id));
    return { ok: true, serial };
  }

  await db.insert(routerSerialLocks).values({ serialNumber: serial, routerId, orgId });
  return { ok: true, serial };
}

// Routeurs dont le SN a déjà été armé pendant la vie de ce process → évite un
// /system/routerboard/print + une écriture DB à CHAQUE health-check. Un CONFLIT
// (SN d'un autre org) n'est jamais mis en cache : on le re-vérifie à chaque
// passage pour continuer à bloquer l'appareil. Vidé au cold start.
const serialArmed = new Set<string>();

/**
 * Applique le verrou de série sur TOUT chemin de mise en service, appelé depuis
 * syncRouterStats (point de convergence : auto-setup, install VPN/OpenVPN,
 * liaison — tout routeur passe par le sync pour être « online »). Arme le verrou
 * pour ce routeur/org au 1er passage, et signale un conflit si le SN est déjà
 * rattaché à un AUTRE org. DÉFENSIF : SN illisible ou toute erreur → { ok:true }
 * (ne bloque JAMAIS un routeur légitime sur un aléa). Pas de superadmin ici :
 * ça protège les appareils des utilisateurs inscrits.
 */
export async function enforceRouterSerialOnSync(
  client: RouterOSClient,
  routerId: string,
  orgId: string,
): Promise<{ ok: true } | { ok: false; serial: string }> {
  if (serialArmed.has(routerId)) return { ok: true };
  const res = await reserveRouterSerial(client, routerId, orgId).catch(
    () => ({ ok: true, serial: null }) as SerialLockResult,
  );
  if (res.ok) {
    serialArmed.add(routerId);
    return { ok: true };
  }
  return { ok: false, serial: res.serial };
}

/** Réinitialise (superadmin) : libère le verrou d'un SN → ré-utilisable. */
export async function releaseRouterSerialLock(serialNumber: string, superadminUserId: string): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .update(routerSerialLocks)
    .set({ releasedAt: new Date(), releasedBy: superadminUserId })
    .where(and(eq(routerSerialLocks.serialNumber, serialNumber), isNull(routerSerialLocks.releasedAt)))
    .returning({ id: routerSerialLocks.id });
  return rows.length > 0;
}

/**
 * Oublie l'état « SN déjà armé » pour un routeur.
 *
 * `serialArmed` évite de relire le numéro de série à chaque health-check, mais
 * il mémorise aussi les SUCCÈS : après un transfert de verrou, l'ancien
 * détenteur resterait considéré comme armé pour la durée de vie du process et
 * continuerait à se croire légitime. On l'oublie explicitement des deux côtés
 * pour que la prochaine synchro tranche sur l'état réel de la base.
 */
export function forgetArmedSerial(routerId: string): void {
  serialArmed.delete(routerId);
}

export type SerialTransfer = {
  serial: string;
  /** Détenteur précédent, absent si le SN n'était pas encore verrouillé. */
  from: { routerId: string | null; orgId: string | null } | null;
  to: { routerId: string; orgId: string };
};

/**
 * TRANSFÈRE le verrou d'un numéro de série vers un autre routeur, donc vers un
 * autre compte. Réservé au superadmin (garde posée par l'action appelante).
 *
 * Pourquoi une opération dédiée plutôt qu'un « libérer puis re-synchroniser » :
 * libérer laisse le SN en course. Le premier routeur qui se synchronise le
 * reprend — y compris l'ancien, qui tourne peut-être encore chez son
 * propriétaire. Le transfert désigne le gagnant en une écriture, sans fenêtre
 * de course.
 *
 * L'ancien routeur n'est pas modifié : sa prochaine synchro constatera que le
 * SN appartient désormais à un autre compte et le gardera hors ligne. C'est la
 * même règle qui s'applique, dans l'autre sens — inutile d'aller écrire dans
 * les données d'un tiers.
 */
export async function transferRouterSerialLock(
  serialNumber: string,
  target: { routerId: string; orgId: string },
): Promise<{ ok: true; transfer: SerialTransfer } | { ok: false; error: string }> {
  const serial = serialNumber.trim();
  if (!serial) return { ok: false, error: "Numéro de série requis." };

  const db = getDb();
  const [existing] = await db
    .select()
    .from(routerSerialLocks)
    .where(eq(routerSerialLocks.serialNumber, serial))
    .limit(1);

  if (existing && existing.routerId === target.routerId && existing.releasedAt === null) {
    return { ok: false, error: "Ce numéro de série est déjà rattaché à ce routeur." };
  }

  const from = existing ? { routerId: existing.routerId, orgId: existing.orgId } : null;

  if (existing) {
    await db
      .update(routerSerialLocks)
      .set({
        routerId: target.routerId,
        orgId: target.orgId,
        lockedAt: new Date(),
        releasedAt: null,
        releasedBy: null,
      })
      .where(eq(routerSerialLocks.id, existing.id));
  } else {
    await db
      .insert(routerSerialLocks)
      .values({ serialNumber: serial, routerId: target.routerId, orgId: target.orgId });
  }

  // Les deux routeurs doivent réévaluer leur légitimité à la prochaine synchro.
  forgetArmedSerial(target.routerId);
  if (from?.routerId) forgetArmedSerial(from.routerId);

  return { ok: true, transfer: { serial, from, to: target } };
}
