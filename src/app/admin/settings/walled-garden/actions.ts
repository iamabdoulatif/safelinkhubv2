"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { organizations } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import { PAYMENT_WALLED_GARDEN_HOSTS } from "@/lib/mikrotik/walled-garden";

/** Sélection courante de l'org : hôtes de paiement explicitement désactivés. */
export async function getWalledGardenSelection(): Promise<{ disabledHosts: string[] }> {
  const session = await getSession();
  if (!session) return { disabledHosts: [] };

  const db = getDb();
  const [org] = await db
    .select({ disabled: organizations.walledGardenDisabledHosts })
    .from(organizations)
    .where(eq(organizations.id, session.orgId))
    .limit(1);

  const known = new Set(PAYMENT_WALLED_GARDEN_HOSTS);
  return { disabledHosts: (org?.disabled ?? []).filter((host) => known.has(host)) };
}

/**
 * Enregistre les hôtes DÉSACTIVÉS (décochés) de l'org. On ne stocke que
 * l'ensemble validé au catalogue courant → un hôte inconnu (client trafiqué,
 * ancien motif retiré du code) est ignoré. Prend effet à la prochaine install :
 * bootstrap, sync routeur (re-réconcilié une fois car la liste change) ou
 * assignation de portail.
 */
export async function saveWalledGardenSelection(
  disabledHosts: string[],
): Promise<{ success: true } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: "Non authentifié." };

  if (!Array.isArray(disabledHosts)) return { error: "Sélection invalide." };
  const known = new Set(PAYMENT_WALLED_GARDEN_HOSTS);
  // Dédoublonne + garde seulement les hôtes réellement au catalogue.
  const sanitized = [...new Set(disabledHosts.filter((host) => known.has(host)))];

  const db = getDb();
  await db
    .update(organizations)
    .set({ walledGardenDisabledHosts: sanitized })
    .where(eq(organizations.id, session.orgId));

  revalidatePath("/admin/settings/walled-garden");
  return { success: true };
}
