// Résolution du routeur cible d'une commande portail, TOLÉRANTE à un routerId
// gravé devenu orphelin. Le login.html vit sur la flash du routeur : il grave
// `window.SLH_PORTAL.routerId` une fois à l'installation. Un ré-enrôlement /
// rechange crée une NOUVELLE ligne `routers` (nouvel id) sans réécrire la flash,
// donc /initiate recevait un routerId mort → 404 « Routeur inconnu » → paiement
// mort, en silence (voir mémoire portal-stale-baked-routerid).
//
// Le numéro de série RouterOS, lui, est stable. `router_serial_locks.routerId`
// est réaligné sur le routeur courant à CHAQUE sync (enforceRouterSerialOnSync),
// il pointe donc toujours le bon routeur même après ré-enrôlement. On grave
// aussi la série dans login.html et on s'en sert en repli quand l'id gravé ne
// résout plus. Pur (aucune DB) : les lookups sont injectés, donc testable.

export type RouterLookups = {
  /** routerId gravé → son id s'il appartient à l'org, sinon null (orphelin). */
  byId: (id: string) => Promise<string | null>;
  /** série gravée → routerId COURANT de l'org via le verrou actif, sinon null. */
  bySerial: (serial: string) => Promise<string | null>;
  /** l'unique routeur de l'org (repli portail mono-routeur), sinon null. */
  singleOrgRouter: () => Promise<string | null>;
};

/**
 * Renvoie l'id du routeur courant, ou null si rien ne résout.
 * - routerId gravé qui résout → on le prend (chemin rapide, cas normal).
 * - routerId gravé orphelin → repli sur la série (identifiant stable).
 * - pas de routerId gravé (portail ancien) → série, sinon l'unique routeur.
 */
export async function resolveOrderRouterId(
  input: { routerId: string; serial: string },
  lookups: RouterLookups,
): Promise<string | null> {
  if (input.routerId) {
    const byId = await lookups.byId(input.routerId);
    if (byId) return byId;
  }
  if (input.serial) {
    const bySerial = await lookups.bySerial(input.serial);
    if (bySerial) return bySerial;
  }
  // Un id gravé (même orphelin) signifie un portail multi-routeurs : ne pas
  // retomber sur « l'unique routeur » qui choisirait le mauvais sur un parc.
  if (input.routerId) return null;
  return lookups.singleOrgRouter();
}

// ── Détection d'un routerId gravé périmé (pour le balayage opérateur) ─────────
// Le routerId gravé vit dans `window.SLH_PORTAL={...,"routerId":"...",...}` du
// login.html. JSON.stringify sérialise les clés entre guillemets, sans espace,
// et routerId précède le tableau `countries` (donc avant toute accolade).

const BAKED_ROUTER_ID = /"routerId"\s*:\s*"([^"]*)"/;

/** routerId gravé dans un login.html, ou null si absent (portail non équipé). */
export function extractBakedRouterId(loginHtml: string): string | null {
  const m = BAKED_ROUTER_ID.exec(loginHtml);
  return m ? m[1] : null;
}

/**
 * Vrai si le login.html grave un routerId NON VIDE qui ne correspond plus à
 * l'id courant du routeur → le paiement portail est (ou sera) mort tant qu'on
 * ne réinstalle pas le portail. Un id absent/vide n'est pas « périmé » : rien à
 * réparer (portail tiers sans paiement, ou page jamais équipée).
 */
export function isBakedRouterIdStale(loginHtml: string, currentRouterId: string): boolean {
  const baked = extractBakedRouterId(loginHtml);
  return baked !== null && baked !== "" && baked !== currentRouterId;
}
