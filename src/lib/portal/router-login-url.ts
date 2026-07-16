import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { routers } from "@/lib/db/schema";
import type { HotspotStackOptions } from "@/lib/mikrotik/container-setup";

/**
 * Base URL du login hotspot RouterOS d'un routeur, p.ex.
 * "http://kalam-wifi.ci/login" — dérivée de l'instantané du dernier auto-setup
 * (lastAutoSetupConfig.dnsName, sinon hotspotAddress). Sert à l'auto-connexion
 * depuis la page de paiement : le téléphone (encore sur le WiFi captif, dans le
 * walled-garden) navigue vers `<loginUrl>?username=CODE&password=CODE`, que le
 * hotspot authentifie directement (le profil active `http-pap`, cf.
 * container-setup.ts) — pas de md5/chap nécessaire.
 *
 * En http (le hotspot local n'a pas de TLS) : une navigation top-level https→
 * http est autorisée par les navigateurs (contrairement aux sous-ressources).
 * Le dns-name ne résout que sur le réseau captif, ce qui est le cas ici.
 *
 * Renvoie null si le routeur n'a pas d'instantané exploitable (auto-setup
 * jamais terminé) — l'appelant retombe alors sur la saisie manuelle du code.
 */
export async function buildRouterLoginUrl(routerId: string | null): Promise<string | null> {
  if (!routerId) return null;
  const db = getDb();
  const [router] = await db
    .select({ config: routers.lastAutoSetupConfig })
    .from(routers)
    .where(eq(routers.id, routerId))
    .limit(1);
  const config = router?.config as Partial<HotspotStackOptions> | null | undefined;
  const host = config?.dnsName?.trim() || config?.hotspotAddress?.trim();
  if (!host) return null;
  // host est un dns-name (kalam-wifi.ci) ou une IP (10.0.0.1) — jamais d'origine
  // externe : on préfixe simplement http:// sans autre échappement.
  return `http://${host}/login`;
}
