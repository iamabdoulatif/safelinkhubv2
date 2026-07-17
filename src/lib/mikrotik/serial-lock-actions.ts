"use server";

// Actions superadmin pour le verrou SN de l'auto-setup : lister les verrous et
// en réinitialiser un (routeur revendu, reset légitime) → le SN redevient
// ré-utilisable pour un nouvel auto-setup.

import { desc } from "drizzle-orm";
import { getSession, isSuperAdmin } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { routerSerialLocks } from "@/lib/db/schema";
import { releaseRouterSerialLock } from "./router-serial-lock";

export async function listRouterSerialLocks() {
  const session = await getSession();
  if (!isSuperAdmin(session?.role)) return [];
  const db = getDb();
  return db.select().from(routerSerialLocks).orderBy(desc(routerSerialLocks.lockedAt));
}

export async function releaseRouterSerialLockAction(serialNumber: string) {
  const session = await getSession();
  if (!session || !isSuperAdmin(session.role)) return { error: "Réservé au superadmin." };
  const sn = String(serialNumber ?? "").trim();
  if (!sn) return { error: "Numéro de série requis." };
  const ok = await releaseRouterSerialLock(sn, session.userId);
  return ok ? { success: true } : { error: "Verrou introuvable ou déjà libéré." };
}
