/** Run BEFORE persistence, network connections, notifications or RouterOS writes. */
export function regulationApplyGuard(body: { dryRun?: unknown; observationOnly?: unknown; mode?: unknown }, enabled: boolean, fupV2: boolean) {
  if (body.dryRun === true || body.observationOnly === true || body.mode === "observation") {
    return { status: 200, body: { applied: false, observationOnly: true, reason: "Observation : aucune écriture ni commande routeur." } };
  }
  if (!enabled) return { status: 409, body: { applied: false, reason: "Régulation désactivée." } };
  if (fupV2) return { status: 409, body: { applied: false, reason: "FUP par liaison : le moteur historique ne peut pas appliquer cette politique." } };
  return null;
}
