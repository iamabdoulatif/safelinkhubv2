import { loadPendingRoamingBindings, syncRoamingDeviceBinding, type PropagateResult } from "./mac-propagate";
import type { RouterOSClient } from "@/lib/mikrotik/client";
import { inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { roamingDeviceBindingRouters } from "@/lib/db/schema";

type PendingBinding = { id: string };

type RetryDependencies = {
  loadPending?: (routerId: string, limit: number) => Promise<PendingBinding[]>;
  sync?: (input: { bindingId: string; onlyRouterId: string; currentRouterClient?: RouterOSClient }) => Promise<PropagateResult>;
  limit?: number;
  currentRouterClient?: RouterOSClient;
};

/**
 * Réessaie seulement les liaisons dont cette zone n'a pas encore confirmé la
 * matérialisation. Une erreur individuelle n'empêche jamais les autres comptes
 * de récupérer leur accès automatique au retour du MikroTik.
 */
export async function retryPendingRoamingBindingsForRouter(
  routerId: string,
  dependencies: RetryDependencies = {},
) {
  const limit = dependencies.limit ?? 50;
  const pending = await (dependencies.loadPending ?? loadPendingRoamingBindings)(routerId, limit);
  let synchronized = 0;
  for (const binding of pending) {
    const result = await (dependencies.sync ?? syncRoamingDeviceBinding)({
      bindingId: binding.id,
      onlyRouterId: routerId,
      currentRouterClient: dependencies.currentRouterClient,
    }).catch((): PropagateResult => ({ ok: false }));
    if (result.ok && (result.boundOn ?? 0) > 0) synchronized += 1;
  }
  return { attempted: pending.length, synchronized };
}

type AllRetryDependencies = {
  loadRouterIds?: () => Promise<string[]>;
  retryRouter?: (routerId: string) => Promise<{ attempted: number; synchronized: number }>;
};

/** Filet périodique : répartit les reprises sur les zones qui ont réellement un état en attente. */
export async function retryAllPendingRoamingBindings(dependencies: AllRetryDependencies = {}) {
  const routerIds = await (dependencies.loadRouterIds ?? loadPendingBindingRouterIds)();
  let attempted = 0;
  let synchronized = 0;
  for (const routerId of routerIds) {
    const result = await (dependencies.retryRouter ?? retryPendingRoamingBindingsForRouter)(routerId);
    attempted += result.attempted;
    synchronized += result.synchronized;
  }
  return { routers: routerIds.length, attempted, synchronized };
}

async function loadPendingBindingRouterIds() {
  const rows = await getDb()
    .selectDistinct({ routerId: roamingDeviceBindingRouters.routerId })
    .from(roamingDeviceBindingRouters)
    .where(inArray(roamingDeviceBindingRouters.status, ["PENDING", "ERROR"]))
    .limit(25);
  return rows.map((row) => row.routerId);
}
