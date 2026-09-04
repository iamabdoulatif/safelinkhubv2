/**
 * Santé d'un parc, calculée à partir des lignes déjà chargées.
 *
 * POURQUOI CE MODULE EXISTE. L'écran savait COMPTER (les chips de filtre
 * portaient 11 / 10 / 1) mais ne savait rien DIRE : le même objet servait de
 * compteur et de filtre, si bien que « combien de routeurs vont mal » et
 * « montre-moi ceux qui vont mal » avaient la même apparence. Séparer le
 * constat de l'action demande d'abord de nommer le constat — c'est ce que
 * fait ce fichier, en données pures, testable sans monter d'interface.
 */

import { isConfiguringRouter } from "./router-portfolio";

export type FleetRouterLike = {
  id: string;
  status: string;
  lastSyncAtMs: number | null;
};

export type FleetHealth<T extends FleetRouterLike> = {
  total: number;
  online: number;
  offline: number;
  configuring: number;
  /** Part de routeurs en ligne, 1 décimale. null = parc vide (pas 0 %). */
  availability: number | null;
  /** Routeurs hors ligne, le plus inquiétant d'abord. */
  attention: T[];
};

/** Hors ligne = ni en ligne, ni en cours de configuration (état transitoire). */
export function isOfflineRouter(status: string): boolean {
  return status !== "online" && !isConfiguringRouter(status);
}

export function computeFleetHealth<T extends FleetRouterLike>(routers: T[]): FleetHealth<T> {
  let online = 0;
  let configuring = 0;
  const attention: T[] = [];

  for (const router of routers) {
    if (router.status === "online") online += 1;
    else if (isConfiguringRouter(router.status)) configuring += 1;
    else attention.push(router);
  }

  // Le jamais-synchronisé passe DEVANT : un routeur qu'on n'a jamais vu
  // répondre est plus inquiétant qu'un routeur vu il y a une heure, alors
  // qu'un tri naïf sur la date le rejetterait en fin de liste.
  attention.sort((a, b) => (a.lastSyncAtMs ?? -1) - (b.lastSyncAtMs ?? -1));

  return {
    total: routers.length,
    online,
    offline: attention.length,
    configuring,
    availability: routers.length === 0 ? null : Math.round((online / routers.length) * 1000) / 10,
    attention,
  };
}
