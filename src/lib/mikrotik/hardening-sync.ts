// Application automatique du durcissement (hardening.ts) à chaque
// synchronisation : au plus une fois par routeur et par process (comme le
// walled-garden). Un nouveau routeur le reçoit à sa première synchro.
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { routers } from "@/lib/db/schema";
import type { RouterOSClient } from "./client";
import { encryptSecret } from "./crypto";
import { ensureRouterHardening, generateMikhmonPassword, rotateDefaultMikhmonPassword } from "./hardening";
import { ensureMikhmonJournalCap, ensureResourceTuning } from "./resource-tuning";

const HARDENING_VERSION = "h2";
const MIKHMON_ROTATION_ENABLED = false;
const hardened = new Map<string, string>();

export async function reconcileHardeningOnce(client: RouterOSClient, routerId: string): Promise<void> {
  if (hardened.get(routerId) === HARDENING_VERSION) return;
  await ensureRouterHardening(client);
  // Allègement RAM/CPU (27/10/2026) : réglages système légers + plafonnement du
  // journal de ventes MikHmon qui, sinon, sature la RAM des petits routeurs.
  await ensureResourceTuning(client).catch(() => {});
  await ensureMikhmonJournalCap(client).catch(() => {});
  // SUSPENDU (13/10/2026) : la rotation du mot de passe MikHmon a changé le
  // mot de passe sur des routeurs sans le conserver (succès non détecté →
  // valeur effacée). Réactiver seulement avec une confirmation fiable.
  hardened.set(routerId, HARDENING_VERSION);
  if (!MIKHMON_ROTATION_ENABLED) return;

  // Mot de passe d'usine de MikHmon : un nouveau mot de passe est enregistré
  // AVANT d'être posé (l'exploitant ne doit jamais perdre l'accès), puis
  // l'ancienne valeur est remise si le routeur n'avait finalement rien à
  // changer (mot de passe déjà personnalisé, pas de MikHmon).
  const db = getDb();
  const [row] = await db
    .select({ prev: routers.mikhmonAdminPasswordEncrypted })
    .from(routers)
    .where(eq(routers.id, routerId))
    .limit(1);
  const password = generateMikhmonPassword((n) => randomBytes(n));
  await db
    .update(routers)
    .set({ mikhmonAdminPasswordEncrypted: encryptSecret(password) })
    .where(eq(routers.id, routerId));
  let rotated = false;
  try {
    rotated = await rotateDefaultMikhmonPassword(client, password);
  } finally {
    if (!rotated) {
      await db
        .update(routers)
        .set({ mikhmonAdminPasswordEncrypted: row?.prev ?? null })
        .where(eq(routers.id, routerId));
    }
  }
  if (rotated) {
    console.log(JSON.stringify({ msg: "mikhmon default password replaced", routerId }));
  }
  hardened.set(routerId, HARDENING_VERSION);
}
