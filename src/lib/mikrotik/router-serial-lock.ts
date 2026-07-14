// Verrou anti-abus de l'auto-setup par numéro de série RouterOS. Un MikroTik
// (par SN) ne peut être auto-configuré qu'UNE fois : au 1er auto-setup réussi on
// enregistre son SN ; un 2e essai sur le même SN depuis un AUTRE routeur/org est
// refusé, sauf réinitialisation superadmin. Module serveur uniquement.

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
 * Vérifie que le routeur peut être auto-configuré, PUIS réserve son SN.
 * - SN illisible (rare, hors RouterBOARD) → on autorise sans verrou (best-effort).
 * - SN déjà verrouillé par CE routeur (ou verrou libéré) → on autorise (re-run légitime).
 * - SN verrouillé par un AUTRE routeur, non libéré → REFUS (sauf `force`).
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
    if (active && existing.routerId !== routerId && !opts?.force) {
      return {
        ok: false,
        serial,
        error: `Ce MikroTik (série ${serial}) a déjà été configuré et est verrouillé. Contactez le support pour le réinitialiser.`,
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
