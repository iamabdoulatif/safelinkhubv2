// Garantit que le(s) profil(s) hotspot ACTIF(S) d'un routeur ACCEPTENT le login
// PAR CODE + cookie navigateur + mac-cookie — les méthodes nécessaires au
// paiement du portail captif et à la reconnexion automatique d'un appareil.
//
// Pourquoi ce module : un routeur qui n'est PAS passé par l'auto-setup complet
// (ex. MAMBA WIFI, configuré à la main) peut avoir un `login-by` incomplet — sans
// `http-chap`/`http-pap` le code saisi n'authentifie pas de façon fiable, et sans
// `mac-cookie` un téléphone qui revient sur le WiFi doit re-saisir son code.
// Aucun chemin runtime ne ré-assurait ce réglage hors auto-setup : on le fait ici
// pour amener n'importe quel routeur à parité.
//
// ADDITIF (et non écrasant) : on garantit la PRÉSENCE des méthodes requises SANS
// retirer celles déjà là. Constaté on-device : le routeur de référence « parfait »
// (RUE-NICOLAS) a `login-by=mac,cookie,http-chap,http-pap,mac-cookie` — écraser
// par un jeu fixe `cookie,http-chap,http-pap` retirerait `mac`/`mac-cookie` et
// DIVERGERAIT du routeur de référence. On préserve donc l'existant et on
// n'ajoute QUE ce qui manque. Idempotent : ne /set que si une méthode manque.
// Best-effort par profil : ne lève pas. Module serveur uniquement.

import type { RouterOSClient } from "./client";

// Le cookie navigateur n'est qu'un confort : l'autorisation durable roaming
// repose sur la liaison MAC en base. Un an reste toutefois assez long pour que
// le portail ne réapparaisse pas pendant l'usage normal d'un appareil.
export const ROAMING_COOKIE_LIFETIME = "52w1d";

// Méthodes de login exigées pour le paiement par code du portail captif :
//   cookie    → le même navigateur ne re-saisit pas le code (session persistée)
//   http-chap → saisie du code chiffrée (page de login standard RouterOS)
//   http-pap  → repli en clair pour les clients/versions qui ne font pas CHAP
// On garantit leur PRÉSENCE ; les autres méthodes déjà posées sont préservées.
const REQUIRED_LOGIN_METHODS = ["cookie", "http-chap", "http-pap", "mac-cookie"] as const;

function parseLoginBy(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((m) => m.trim().toLowerCase())
    .filter(Boolean);
}

function isRouterOsEnabled(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  return normalized === "true" || normalized === "yes";
}

/** Host de login du hotspot lu EN LIVE sur le profil actif du routeur : sert à
 * construire l'URL d'auto-connexion (`http://<host>/login`) même sur un routeur
 * dont l'instantané d'auto-setup en base est vide (ex. MAMBA WIFI). */
export type HotspotLoginHost = {
  dnsName: string | null;
  hotspotAddress: string | null;
};

/**
 * Garantit que chaque profil hotspot réellement utilisé par un serveur ACTIF
 * accepte cookie+http-chap+http-pap+mac-cookie, en PRÉSERVANT les méthodes déjà
 * présentes (mac…) : on ajoute uniquement les méthodes requises manquantes.
 * Ne /set que si au moins une manque. Best-effort par profil : un échec
 * n'interrompt pas les autres et n'est jamais relancé vers l'appelant.
 *
 * Renvoie la liste des profils complétés ET le host de login lu sur le profil du
 * premier serveur actif (`dns-name`/`hotspot-address`) — l'appelant le persiste
 * pour l'auto-connexion (voir persistRouterLoginHost).
 */
export async function ensureHotspotLoginByCode(
  client: RouterOSClient,
  timeoutMs = 15000,
): Promise<{ fixed: string[]; loginHost: HotspotLoginHost | null }> {
  const fixed: string[] = [];

  const servers = await client
    .talk(["/ip/hotspot/print"], timeoutMs)
    .catch(() => [] as Record<string, string>[]);
  // Serveurs hotspot NON désactivés : les seuls qui servent la page de login
  // vue par un client qui paie. Le premier fournit le host de login à persister.
  const enabledServers = servers.filter((s) => s.disabled !== "true" && s.profile);
  const activeProfileNames = new Set(enabledServers.map((s) => s.profile as string));
  if (activeProfileNames.size === 0) return { fixed, loginHost: null };
  const primaryProfileName = enabledServers[0]?.profile;

  const profiles = await client
    .talk(["/ip/hotspot/profile/print"], timeoutMs)
    .catch(() => [] as Record<string, string>[]);

  let loginHost: HotspotLoginHost | null = null;
  for (const profile of profiles) {
    const name = profile.name;
    const id = profile[".id"];
    if (!name || !id || !activeProfileNames.has(name)) continue;

    // Host de login lu sur le profil du serveur actif principal.
    if (name === primaryProfileName) {
      loginHost = {
        dnsName: profile["dns-name"]?.trim() || null,
        hotspotAddress: profile["hotspot-address"]?.trim() || null,
      };
    }

    const current = parseLoginBy(profile["login-by"]);
    const present = new Set(current);
    const missing = REQUIRED_LOGIN_METHODS.filter((m) => !present.has(m));
    const needsLongHttpCookie = profile["http-cookie-lifetime"] !== ROAMING_COOKIE_LIFETIME;
    if (missing.length === 0 && !needsLongHttpCookie) continue;

    // Additif : méthodes existantes (ordre préservé) + celles qui manquent.
    const merged = [...current, ...missing].join(",");
    try {
      await client.talk(
        [
          "/ip/hotspot/profile/set",
          `=numbers=${id}`,
          `=login-by=${merged}`,
          `=http-cookie-lifetime=${ROAMING_COOKIE_LIFETIME}`,
        ],
        timeoutMs,
      );
      fixed.push(name);
    } catch {
      // best-effort : un profil qui refuse le set ne bloque pas les autres.
    }
  }

  // `mac-cookie` dans le profil du serveur n'est utile que si les profils de
  // tickets demandent à RouterOS d'en créer un après l'authentification valide.
  // Cette option est sur le user-profile (et non le server profile) ; elle doit
  // donc être réparée séparément pour les profils provenant d'une restauration
  // ou créés avant cette garantie.
  const voucherProfiles = await client
    .talk(["/ip/hotspot/user/profile/print"], timeoutMs)
    .catch(() => [] as Record<string, string>[]);
  for (const voucherProfile of voucherProfiles) {
    const id = voucherProfile[".id"];
    const needsMacCookie = !isRouterOsEnabled(voucherProfile["add-mac-cookie"]);
    const needsLongMacCookie = voucherProfile["mac-cookie-timeout"] !== ROAMING_COOKIE_LIFETIME;
    if (!id || (!needsMacCookie && !needsLongMacCookie)) continue;

    try {
      await client.talk(
        [
          "/ip/hotspot/user/profile/set",
          `=numbers=${id}`,
          "=add-mac-cookie=yes",
          `=mac-cookie-timeout=${ROAMING_COOKIE_LIFETIME}`,
        ],
        timeoutMs,
      );
    } catch {
      // best-effort : un profil qui refuse le set ne bloque pas les autres.
    }
  }

  return { fixed, loginHost };
}

// Méthodes de login nécessaires à l'AUTO-LOGIN PAR MAC (roaming inter-zones) :
//   mac        → un utilisateur hotspot nommé <MAC> est authentifié sans portail
//   mac-cookie → le MAC reste auto-reconnecté après une 1ʳᵉ authentification
// C'est ce que porte déjà le routeur de référence (RUE-NICOLAS). Ajout ADDITIF :
// on ne retire jamais les méthodes existantes (cookie/http-chap/http-pap…).
const MAC_LOGIN_METHODS = ["mac", "mac-cookie"] as const;

/**
 * Garantit que les profils hotspot des serveurs ACTIFS acceptent le login par
 * MAC (mac + mac-cookie), en PRÉSERVANT les méthodes déjà présentes. Sans ça,
 * l'utilisateur `name=<MAC>` créé sur les zones sœurs ne serait jamais
 * auto-logué et le client devrait re-saisir son code en changeant de zone.
 *
 * Idempotent (ne /set que si une méthode manque), best-effort par profil.
 * Renvoie les profils complétés.
 */
export async function ensureMacAutoLogin(
  client: RouterOSClient,
  timeoutMs = 15000,
): Promise<{ fixed: string[] }> {
  const fixed: string[] = [];

  const servers = await client
    .talk(["/ip/hotspot/print"], timeoutMs)
    .catch(() => [] as Record<string, string>[]);
  const activeProfileNames = new Set(
    servers.filter((s) => s.disabled !== "true" && s.profile).map((s) => s.profile as string),
  );
  if (activeProfileNames.size === 0) return { fixed };

  const profiles = await client
    .talk(["/ip/hotspot/profile/print"], timeoutMs)
    .catch(() => [] as Record<string, string>[]);

  for (const profile of profiles) {
    const name = profile.name;
    const id = profile[".id"];
    if (!name || !id || !activeProfileNames.has(name)) continue;

    const current = parseLoginBy(profile["login-by"]);
    const present = new Set(current);
    const missing = MAC_LOGIN_METHODS.filter((m) => !present.has(m));
    const needsLongHttpCookie = profile["http-cookie-lifetime"] !== ROAMING_COOKIE_LIFETIME;
    if (missing.length === 0 && !needsLongHttpCookie) continue;

    const merged = [...current, ...missing].join(",");
    try {
      await client.talk(
        [
          "/ip/hotspot/profile/set",
          `=numbers=${id}`,
          `=login-by=${merged}`,
          `=http-cookie-lifetime=${ROAMING_COOKIE_LIFETIME}`,
        ],
        timeoutMs,
      );
      fixed.push(name);
    } catch {
      // best-effort : un profil qui refuse le set ne bloque pas les autres.
    }
  }

  return { fixed };
}
