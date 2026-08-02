// Garantit que le(s) profil(s) hotspot ACTIF(S) d'un routeur ACCEPTENT le login
// PAR CODE + cookie — les méthodes nécessaires au paiement du portail captif.
//
// Pourquoi ce module : un routeur qui n'est PAS passé par l'auto-setup complet
// (ex. MAMBA WIFI, configuré à la main) peut avoir un `login-by` incomplet — sans
// `http-chap`/`http-pap` le code saisi n'authentifie pas de façon fiable, et sans
// `cookie` l'appareil doit RE-SAISIR le code à chaque reconnexion (le navigateur
// ne garde pas de session). Aucun chemin runtime ne ré-assurait ce réglage hors
// auto-setup : on le fait ici pour amener n'importe quel routeur à parité.
//
// ADDITIF (et non écrasant) : on garantit la PRÉSENCE des méthodes requises SANS
// retirer celles déjà là. Constaté on-device : le routeur de référence « parfait »
// (RUE-NICOLAS) a `login-by=mac,cookie,http-chap,http-pap,mac-cookie` — écraser
// par un jeu fixe `cookie,http-chap,http-pap` retirerait `mac`/`mac-cookie` et
// DIVERGERAIT du routeur de référence. On préserve donc l'existant et on
// n'ajoute QUE ce qui manque. Idempotent : ne /set que si une méthode manque.
// Best-effort par profil : ne lève pas. Module serveur uniquement.

import type { RouterOSClient } from "./client";

// Méthodes de login exigées pour le paiement par code du portail captif :
//   cookie    → le même navigateur ne re-saisit pas le code (session persistée)
//   http-chap → saisie du code chiffrée (page de login standard RouterOS)
//   http-pap  → repli en clair pour les clients/versions qui ne font pas CHAP
// On garantit leur PRÉSENCE ; les autres méthodes déjà posées sont préservées.
const REQUIRED_LOGIN_METHODS = ["cookie", "http-chap", "http-pap"] as const;

function parseLoginBy(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((m) => m.trim().toLowerCase())
    .filter(Boolean);
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
 * accepte cookie+http-chap+http-pap, en PRÉSERVANT les méthodes déjà présentes
 * (mac, mac-cookie…) : on ajoute uniquement les méthodes requises manquantes.
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
    if (missing.length === 0) continue; // déjà couvert → on ne touche à rien

    // Additif : méthodes existantes (ordre préservé) + celles qui manquent.
    const merged = [...current, ...missing].join(",");
    try {
      await client.talk(
        ["/ip/hotspot/profile/set", `=numbers=${id}`, `=login-by=${merged}`],
        timeoutMs,
      );
      fixed.push(name);
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
    if (missing.length === 0) continue;

    const merged = [...current, ...missing].join(",");
    try {
      await client.talk(
        ["/ip/hotspot/profile/set", `=numbers=${id}`, `=login-by=${merged}`],
        timeoutMs,
      );
      fixed.push(name);
    } catch {
      // best-effort : un profil qui refuse le set ne bloque pas les autres.
    }
  }

  return { fixed };
}
