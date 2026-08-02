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

/**
 * Persiste le host de login LIVE d'un routeur (dns-name / hotspot-address lus sur
 * la box) dans `lastAutoSetupConfig`, POUR QUE l'auto-connexion fonctionne même
 * sur un routeur qui n'a jamais fini l'assistant d'auto-setup (ex. MAMBA WIFI,
 * `lastAutoSetupConfig` = null → buildRouterLoginUrl renvoyait null → pas
 * d'auto-connexion). Appelé quand on est déjà connecté au routeur (prewarm /pay,
 * health-check) via le host renvoyé par ensureHotspotLoginByCode.
 *
 * NON destructif : n'écrit QUE si la config n'a pas déjà un host exploitable —
 * on ne clobbe jamais l'instantané d'un vrai auto-setup (ex. RUE-NICOLAS garde
 * son yahya.ci). Best-effort : ne lève pas. Renvoie true si une écriture a eu lieu.
 */
export async function persistRouterLoginHost(
  routerId: string | null,
  host: { dnsName: string | null; hotspotAddress: string | null } | null,
): Promise<boolean> {
  const value = host?.dnsName?.trim() || host?.hotspotAddress?.trim();
  if (!routerId || !value) return false;
  try {
    const db = getDb();
    const [router] = await db
      .select({ config: routers.lastAutoSetupConfig })
      .from(routers)
      .where(eq(routers.id, routerId))
      .limit(1);
    const config = (router?.config as Partial<HotspotStackOptions> | null | undefined) ?? null;
    const existingHost = config?.dnsName?.trim() || config?.hotspotAddress?.trim();
    if (existingHost) return false; // déjà exploitable → ne pas écraser l'assistant

    const merged: Record<string, unknown> = { ...(config ?? {}) };
    if (host?.dnsName?.trim()) merged.dnsName = host.dnsName.trim();
    if (host?.hotspotAddress?.trim()) merged.hotspotAddress = host.hotspotAddress.trim();
    await db
      .update(routers)
      .set({ lastAutoSetupConfig: merged })
      .where(eq(routers.id, routerId));
    return true;
  } catch {
    return false; // best-effort : réessayé au prochain passage
  }
}
