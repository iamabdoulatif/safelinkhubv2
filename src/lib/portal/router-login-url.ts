import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { routers } from "@/lib/db/schema";
import type { HotspotStackOptions } from "@/lib/mikrotik/container-setup";

/**
 * Base URL du login hotspot RouterOS d'un routeur, p.ex.
 * "http://10.0.0.1/login" — dérivée de l'instantané du dernier auto-setup.
 * Sert à l'auto-connexion depuis la page de paiement : le téléphone (encore sur
 * le WiFi captif, dans le walled-garden) navigue vers
 * `<loginUrl>?username=CODE&password=CODE`, que le hotspot authentifie
 * directement (le profil active `http-pap`, cf. container-setup.ts) — pas de
 * md5/chap nécessaire.
 *
 * En http : le hotspot local n'a pas de TLS valable, et une navigation
 * top-level https→http reste autorisée par les navigateurs (contrairement aux
 * sous-ressources).
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
  const host = choisirHoteLogin(config ?? null);
  if (!host) return null;
  // host est une IP (10.0.0.1) ou, à défaut, un dns-name — jamais d'origine
  // externe : on préfixe simplement http:// sans autre échappement.
  return `http://${host}/login`;
}

/**
 * L'ADRESSE IP D'ABORD, le dns-name seulement en dernier recours.
 *
 * Le dns-name du portail (« yahya.ci ») ressemble à un domaine public, et c'est
 * précisément le problème sur un téléphone :
 *   • le navigateur tente spontanément la version https de l'adresse, et tombe
 *     sur le certificat auto-signé du routeur — écran « problèmes de
 *     sécurité » du mini-navigateur Android, page inaccessible ;
 *   • un téléphone qui utilise un DNS privé (DNS-over-HTTPS, activé par défaut
 *     sur beaucoup d'Android) n'interroge pas le routeur : le nom ne résout
 *     pas, ou résout vers le vrai domaine public s'il existe.
 * Une IP privée n'a ni certificat, ni résolution DNS, ni promotion https
 * automatique : elle marche dans tous les navigateurs, y compris le
 * mini-navigateur captif.
 */
export function choisirHoteLogin(
  config: Pick<Partial<HotspotStackOptions>, "dnsName" | "hotspotAddress"> | null,
): string | null {
  return config?.hotspotAddress?.trim() || config?.dnsName?.trim() || null;
}

/**
 * Persiste le host de login LIVE d'un routeur (dns-name / hotspot-address lus sur
 * la box) dans `lastAutoSetupConfig`, POUR QUE l'auto-connexion fonctionne même
 * sur un routeur qui n'a jamais fini l'assistant d'auto-setup (ex. MAMBA WIFI,
 * `lastAutoSetupConfig` = null → buildRouterLoginUrl renvoyait null → pas
 * d'auto-connexion). Appelé quand on est déjà connecté au routeur (prewarm /pay,
 * health-check) via le host renvoyé par ensureHotspotLoginByCode.
 *
 * NON destructif : ne REMPLIT que les trous. Un champ déjà renseigné par
 * l'assistant n'est jamais réécrit (RUE-NICOLAS garde son yahya.ci), mais un
 * routeur qui n'avait QUE son dns-name reçoit enfin son adresse IP — celle dont
 * l'auto-connexion a besoin depuis que l'IP passe avant le nom (voir
 * choisirHoteLogin). Best-effort : ne lève pas. Renvoie true si une écriture a
 * eu lieu.
 */
export async function persistRouterLoginHost(
  routerId: string | null,
  host: { dnsName: string | null; hotspotAddress: string | null } | null,
): Promise<boolean> {
  if (!routerId || !host) return false;
  try {
    const db = getDb();
    const [router] = await db
      .select({ config: routers.lastAutoSetupConfig })
      .from(routers)
      .where(eq(routers.id, routerId))
      .limit(1);
    const config = (router?.config as Partial<HotspotStackOptions> | null | undefined) ?? null;
    const merged = completerHoteLogin(config, host);
    if (!merged) return false;

    await db
      .update(routers)
      .set({ lastAutoSetupConfig: merged })
      .where(eq(routers.id, routerId));
    return true;
  } catch {
    return false; // best-effort : réessayé au prochain passage
  }
}

/**
 * Config complétée par ce qui manque, ou null s'il n'y a rien à écrire.
 * Un champ déjà présent en base n'est jamais remplacé.
 */
export function completerHoteLogin(
  config: Record<string, unknown> | null,
  host: { dnsName: string | null; hotspotAddress: string | null },
): Record<string, unknown> | null {
  const actuel = (config ?? {}) as Partial<HotspotStackOptions>;
  const merged: Record<string, unknown> = { ...(config ?? {}) };
  let change = false;
  const dnsName = host.dnsName?.trim();
  const hotspotAddress = host.hotspotAddress?.trim();
  if (dnsName && !actuel.dnsName?.trim()) {
    merged.dnsName = dnsName;
    change = true;
  }
  if (hotspotAddress && !actuel.hotspotAddress?.trim()) {
    merged.hotspotAddress = hotspotAddress;
    change = true;
  }
  return change ? merged : null;
}
