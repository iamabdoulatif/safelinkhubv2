import assert from "node:assert/strict";
import { test } from "node:test";
import { chartWindow, nearestChartPoint } from "./traffic-chart-window";
import type { TrafficChartPoint } from "@/lib/mikrotik/traffic-history";
const p = (at: number, n: number | null): TrafficChartPoint => ({ at, rxMbps: n, txMbps: n, connected: n, exchanging: n });
test("fit removes only empty edges, retaining real gaps and measured zero", () => {
  const points = [p(0, null), p(300000, 0), p(600000, null), p(900000, 12), p(1200000, null)];
  assert.deepEqual(chartWindow(points, true), points.slice(1, 4));
  assert.deepEqual(chartWindow(points, false), points);
});
test("traffic and sessions share bounds even when the first traffic baseline is unknown", () => {
  const points = [p(0, null), { ...p(300000, null), connected: 40 }, p(600000, 12)];
  assert.equal(chartWindow(points, true)[0].at, 300000);
  assert.equal(chartWindow([p(0, null)], true).length, 1);
  assert.equal(chartWindow([], true).length, 0);
});
test("hover follows actual timestamps, including irregular spacing and a single point", () => {
  assert.equal(nearestChartPoint([p(0, 1), p(300000, 2), p(1200000, 3)], 800000), 2);
  assert.equal(nearestChartPoint([p(0, 1)], 300000), 0);
  assert.equal(nearestChartPoint([], 0), null);
});
