// Garantit que le(s) profil(s) hotspot ACTIF(S) d'un routeur acceptent le login
// PAR CODE + cookie — exactement ce que pose l'auto-setup complet
// (provisionHotspotStack, container-setup.ts : login-by=cookie,http-chap,http-pap).
//
// Pourquoi ce module : un routeur qui n'est PAS passé par l'auto-setup complet
// (ex. MAMBA WIFI, configuré à la main) peut avoir un `login-by` incomplet — sans
// `http-chap`/`http-pap` le code saisi n'authentifie pas de façon fiable, et sans
// `cookie` l'appareil doit RE-SAISIR le code à chaque reconnexion (le navigateur
// ne garde pas de session). RUE-NICOLAS, lui, a reçu la bonne valeur au setup.
// Aucun chemin runtime ne ré-assurait ce réglage hors auto-setup : on le fait ici
// pour amener n'importe quel routeur à parité, appelé depuis le flux de paiement.
//
// Idempotent et NON destructif : on ne réécrit le profil QUE si sa valeur
// `login-by` ne couvre pas déjà les trois méthodes attendues — sinon on ne touche
// à rien (pas de perturbation des sessions en cours). Best-effort : ne lève pas.
// Module serveur uniquement.

import type { RouterOSClient } from "./client";

// Méthodes de login exigées pour le paiement par code du portail captif :
//   cookie    → le même navigateur ne re-saisit pas le code (session persistée)
//   http-chap → saisie du code chiffrée (page de login standard RouterOS)
//   http-pap  → repli en clair pour les clients/versions qui ne font pas CHAP
// Ordre calé sur l'auto-setup (cookie,http-chap,http-pap).
const REQUIRED_LOGIN_METHODS = ["cookie", "http-chap", "http-pap"] as const;
const DESIRED_LOGIN_BY = "cookie,http-chap,http-pap";

function parseLoginBy(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((m) => m.trim().toLowerCase())
      .filter(Boolean),
  );
}

/**
 * Réaligne le `login-by` des profils hotspot réellement utilisés par un serveur
 * hotspot ACTIF sur `cookie,http-chap,http-pap`. Ne fait rien si c'est déjà le
 * cas. Best-effort par profil : un échec n'interrompt pas les autres et n'est
 * jamais relancé vers l'appelant.
 *
 * Renvoie la liste des profils effectivement corrigés (pour le log éventuel).
 */
export async function ensureHotspotLoginByCode(
  client: RouterOSClient,
  timeoutMs = 15000,
): Promise<{ fixed: string[] }> {
  const fixed: string[] = [];

  const servers = await client
    .talk(["/ip/hotspot/print"], timeoutMs)
    .catch(() => [] as Record<string, string>[]);
  // Profils rattachés à un serveur hotspot NON désactivé : les seuls qui
  // servent la page de login vue par un client qui paie.
  const activeProfileNames = new Set(
    servers
      .filter((s) => s.disabled !== "true" && s.profile)
      .map((s) => s.profile as string),
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
    const covered = REQUIRED_LOGIN_METHODS.every((m) => current.has(m));
    if (covered) continue;

    try {
      await client.talk(
        ["/ip/hotspot/profile/set", `=numbers=${id}`, `=login-by=${DESIRED_LOGIN_BY}`],
        timeoutMs,
      );
      fixed.push(name);
    } catch {
      // best-effort : un profil qui refuse le set ne bloque pas les autres.
    }
  }

  return { fixed };
}
