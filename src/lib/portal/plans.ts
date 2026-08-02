// Sélection des forfaits (packages) à afficher sur le portail captif d'un
// routeur — source unique partagée par le rendu des fichiers du portail
// (captive-template route, {{PLANS_HTML}}/SLH_PLANS) ET l'endpoint LIVE
// /api/portal/[slug]/plans (prix toujours à jour, fetché par le portail au
// chargement). Module serveur uniquement.

import { and, asc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { packages } from "@/lib/db/schema";
import type { PortalPlan } from "@/lib/captive-templates/package-files";

const PLAN_COLUMNS = {
  id: packages.id,
  name: packages.name,
  priceCents: packages.priceCents,
  durationValue: packages.durationValue,
  durationUnit: packages.durationUnit,
  payDisabled: packages.portalPayDisabled,
} as const;

/**
 * Forfaits actifs affichés sur le portail de CE routeur. Stratégie stricte
 * (identique au rendu des fichiers) : si le routeur a ≥1 forfait rattaché
 * (packages.routerId = routerId), on n'affiche QUE ceux-là — jamais ceux d'une
 * autre zone WiFi de l'org ; sinon (org legacy jamais re-configurée, ou routerId
 * absent) on retombe sur les forfaits « globaux » (routerId = null). Triés par
 * prix croissant.
 */
export async function getPortalPlansForRouter(
  orgId: string,
  routerId: string | null,
): Promise<PortalPlan[]> {
  const db = getDb();
  let plans: PortalPlan[] = routerId
    ? await db
        .select(PLAN_COLUMNS)
        .from(packages)
        .where(
          and(
            eq(packages.orgId, orgId),
            eq(packages.active, true),
            eq(packages.routerId, routerId),
          ),
        )
        .orderBy(asc(packages.priceCents))
    : [];
  if (plans.length === 0) {
    plans = await db
      .select(PLAN_COLUMNS)
      .from(packages)
      .where(
        and(eq(packages.orgId, orgId), eq(packages.active, true), isNull(packages.routerId)),
      )
      .orderBy(asc(packages.priceCents));
  }
  return plans;
}
