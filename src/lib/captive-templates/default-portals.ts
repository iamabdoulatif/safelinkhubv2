// Les deux portails livrés par SafeLinkHub, présents d'office dans CHAQUE
// compte. Module « plain » : rien ici ne doit devenir un endpoint.
//
// POURQUOI ILS SONT SEMÉS À LA LECTURE plutôt qu'à l'inscription : semer au
// signup ne servirait que les nouveaux comptes et laisserait tous les
// existants sans portail tant qu'un correctif de rattrapage n'aurait pas
// tourné. Le point de passage unique (listCaptiveTemplates, lu par la page des
// modèles ET par l'assistant d'auto-setup) les fait apparaître partout, tout
// de suite, sans migration.

import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { captiveTemplates } from "@/lib/db/schema";
import { loadSafelinkhubDefaultPackage, loadYahyaWifiPackage } from "./package-files";

export const DEFAULT_PORTALS = [
  { name: "hotspot-sfh1", load: loadSafelinkhubDefaultPackage },
  { name: "hotspot-sfh2", load: loadYahyaWifiPackage },
] as const;

const DEFAULT_PORTAL_NAMES = DEFAULT_PORTALS.map((portal) => portal.name);

/** Lesquels manquent au compte ? Séparé du SQL pour être vérifiable. */
export function portalsToSeed(presentNames: string[]) {
  return DEFAULT_PORTALS.filter((portal) => !presentNames.includes(portal.name));
}

/**
 * Ajoute les portails manquants au compte. Idempotent : ne touche pas à ceux
 * qui existent déjà (leur contenu peut avoir été personnalisé — le bouton
 * « mettre à jour » de la page des modèles reste le seul à les réécrire).
 *
 * Course concurrente : deux lectures simultanées sur un compte neuf peuvent
 * tenter le même semis. L'index unique PARTIEL
 * `captive_templates_default_portal_uniq` (scripts/add-default-portal-unique-index.sql)
 * tranche côté base, et `onConflictDoNothing` fait de la perdante un no-op.
 * L'index est partiel car la duplication de modèles produit des doublons
 * légitimes de (org_id, name) — un index global la casserait.
 */
export async function ensureDefaultPortals(orgId: string): Promise<void> {
  const db = getDb();
  const present = await db
    .select({ name: captiveTemplates.name })
    .from(captiveTemplates)
    .where(
      and(
        eq(captiveTemplates.orgId, orgId),
        inArray(captiveTemplates.name, [...DEFAULT_PORTAL_NAMES]),
      ),
    );

  const missing = portalsToSeed(present.map((row) => row.name));
  if (missing.length === 0) return;

  // Le compte a-t-il déjà UN modèle, quel qu'il soit ? Sinon le premier semé
  // devient celui par défaut, comme le fait l'adoption manuelle.
  const [anyTemplate] = await db
    .select({ id: captiveTemplates.id })
    .from(captiveTemplates)
    .where(eq(captiveTemplates.orgId, orgId))
    .limit(1);

  await db
    .insert(captiveTemplates)
    .values(
      missing.map((portal, index) => ({
        orgId,
        name: portal.name,
        templateType: "package" as const,
        packageFiles: portal.load(),
        isDefault: !anyTemplate && index === 0,
      })),
    )
    // Sans cible : n'importe quelle violation d'unicité devient un no-op — la
    // lecture concurrente a déjà semé, il n'y a rien à faire de plus.
    .onConflictDoNothing();
}
