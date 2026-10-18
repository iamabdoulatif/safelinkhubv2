import type { TrafficChartPoint } from "@/lib/mikrotik/traffic-history";

/** Both charts keep identical bounds; only empty edges are trimmed, never interior gaps. */
export function chartWindow(points: TrafficChartPoint[], fit: boolean) {
  if (!fit) return points;
  const measured = (p: TrafficChartPoint) =>
    [p.rxMbps, p.txMbps, p.connected, p.exchanging].some(n => n !== null && Number.isFinite(n));
  const first = points.findIndex(measured);
  if (first < 0) return points;
  let last = points.length - 1;
  while (last > first && !measured(points[last])) last--;
  return points.slice(first, last + 1);
}

export function nearestChartPoint(points: TrafficChartPoint[], at: number): number | null {
  if (!points.length) return null;
  let best = 0;
  for (let i = 1; i < points.length; i++) {
    if (Math.abs(points[i].at - at) < Math.abs(points[best].at - at)) best = i;
  }
  return best;
}
