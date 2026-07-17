// Lecture de la sélection walled-garden d'une org (hôtes de paiement décochés).
// Module SÉPARÉ de walled-garden.ts à dessein : walled-garden.ts ne doit avoir
// que des imports de type (client-safe, importé par l'UI), alors qu'ici on
// touche la base — server-only. Les 3 chemins d'install l'appellent avant de
// déployer.

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { organizations } from "@/lib/db/schema";
import { PAYMENT_WALLED_GARDEN_HOSTS } from "./walled-garden";

/**
 * Hôtes de paiement que l'org a explicitement désactivés. Filtré au catalogue
 * courant : un hôte retiré du code (donc plus dans PAYMENT_WALLED_GARDEN_HOSTS)
 * est ignoré silencieusement. Best-effort — retourne [] (walled-garden complet)
 * si l'org est introuvable ou en cas d'erreur DB, pour ne jamais casser une
 * install à cause de la lecture d'une préférence.
 */
export async function getOrgWalledGardenDisabledHosts(orgId: string): Promise<string[]> {
  try {
    const db = getDb();
    const [org] = await db
      .select({ disabled: organizations.walledGardenDisabledHosts })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);
    const disabled = org?.disabled ?? [];
    const known = new Set(PAYMENT_WALLED_GARDEN_HOSTS);
    return disabled.filter((host) => known.has(host));
  } catch {
    return [];
  }
}
