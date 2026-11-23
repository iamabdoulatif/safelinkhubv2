import { hasFreshWireGuardHandshake } from "./relay";

export type HealthCandidate = {
  id: string;
  name: string;
  status: string;
  lastSyncAt: Date | null;
  wgPeerPublicKey: string | null;
};

/**
 * Ordre de sonde du health-check. Un passage (budget 3 min) ne couvre qu'une
 * partie des routeurs en ligne : les hors-ligne, servis en dernier, n'étaient
 * presque jamais resondés — un routeur revenu (tunnel actif, MikHmon joignable)
 * restait affiché hors ligne des heures, sans mise à jour (HSPT-BENY,
 * 22/11/2026). On sonde donc d'abord les hors-ligne dont la poignée de main
 * WireGuard est fraîche (revenus, sonde courte), puis les en-ligne, puis les
 * autres hors-ligne du sync le plus ancien au plus récent.
 */
export function orderHealthCandidates(
  rows: HealthCandidate[],
  handshakes: Map<string, number>,
  nowMs = Date.now(),
): HealthCandidate[] {
  const byOldest = (a: HealthCandidate, b: HealthCandidate) =>
    (a.lastSyncAt?.getTime() ?? 0) - (b.lastSyncAt?.getTime() ?? 0);
  const revived: HealthCandidate[] = [];
  const online: HealthCandidate[] = [];
  const rest: HealthCandidate[] = [];
  for (const r of rows) {
    if (r.status === "online") online.push(r);
    else if (r.wgPeerPublicKey && hasFreshWireGuardHandshake(handshakes.get(r.wgPeerPublicKey) ?? null, nowMs)) revived.push(r);
    else rest.push(r);
  }
  return [...revived.sort(byOldest), ...online.sort(byOldest), ...rest.sort(byOldest)];
}
