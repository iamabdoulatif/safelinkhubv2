import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { bridges, captiveTemplates, routers } from "@/lib/db/schema";

type Candidate = { id: string; name: string };

/**
 * Portail installé sur un routeur. Règle UNIQUE, partagée par la page Portail
 * captif et par tout ce qui doit ré-envoyer le portail (changement de prix, de
 * contacts) :
 *   1. `routers.captiveTemplateId`, posé à chaque installation ;
 *   2. sinon un bridge hotspot de CE routeur (par id, jamais par nom : deux
 *      routeurs portent souvent le même) ;
 *   3. sinon le modèle que l'auto-setup a nommé d'après le SSID.
 * Les cas 2 et 3 sont des déductions (« présumé »).
 *
 * Avant, la ré-installation après un changement de prix ne regardait que le
 * cas 1 — absent sur 43 routeurs sur 58 configurés avant le suivi — et le
 * portail du MikroTik gardait l'ancien tarif.
 */
export function pickRouterPortal<T extends Candidate>(
  router: { id: string; captiveTemplateId: string | null; ssid: string | null },
  packageTemplates: T[],
  bridgeLinks: { routerId: string; captiveTemplateId: string | null }[],
): { template: T; inferred: boolean } | null {
  const direct = packageTemplates.find((t) => t.id === router.captiveTemplateId);
  if (direct) return { template: direct, inferred: false };
  const viaBridge = packageTemplates.find((t) =>
    bridgeLinks.some((b) => b.routerId === router.id && b.captiveTemplateId === t.id),
  );
  if (viaBridge) return { template: viaBridge, inferred: true };
  const ssid = router.ssid?.trim();
  const viaSsid = ssid ? packageTemplates.find((t) => t.name === `SafeLink Baraka — ${ssid}`) : undefined;
  return viaSsid ? { template: viaSsid, inferred: true } : null;
}

/** SSID que l'auto-setup a servi au portail (repris de sa dernière config). */
export function routerSsid(config: unknown): string | null {
  const c = (config ?? {}) as { ssid?: string; hotspotName?: string };
  return c.ssid?.trim() || c.hotspotName?.trim() || null;
}

/** Version serveur : lit la base et applique pickRouterPortal. */
export async function resolveRouterPortal(orgId: string, routerId: string) {
  const db = getDb();
  const [router] = await db
    .select({ id: routers.id, orgId: routers.orgId, captiveTemplateId: routers.captiveTemplateId, config: routers.lastAutoSetupConfig })
    .from(routers)
    .where(eq(routers.id, routerId))
    .limit(1);
  if (!router || router.orgId !== orgId) return null;
  const [templates, links] = await Promise.all([
    db
      .select({ id: captiveTemplates.id, name: captiveTemplates.name })
      .from(captiveTemplates)
      .where(and(eq(captiveTemplates.orgId, orgId), eq(captiveTemplates.templateType, "package"))),
    db
      .select({ routerId: bridges.routerId, captiveTemplateId: bridges.captiveTemplateId })
      .from(bridges)
      .where(eq(bridges.routerId, routerId)),
  ]);
  return pickRouterPortal(
    { id: router.id, captiveTemplateId: router.captiveTemplateId, ssid: routerSsid(router.config) },
    templates,
    links,
  );
}
