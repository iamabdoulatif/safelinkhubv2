import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import TrafficHistoryChart from "./TrafficHistoryChart";
import type { TrafficChartPoint } from "@/lib/mikrotik/traffic-history";

const point = (time: string, n: number | null): TrafficChartPoint => ({
  at: Date.parse(time), rxMbps: n, txMbps: n, connected: n, exchanging: n,
});
const points = [
  point("2026-10-17T12:30:00Z", null),
  point("2026-10-18T09:15:00Z", 0),
  point("2026-10-18T09:20:00Z", null),
  point("2026-10-18T09:25:00Z", 12),
  point("2026-10-18T09:30:00Z", 15),
  point("2026-10-18T12:30:00Z", null),
];
test("rendered chart uses available timestamps, keeps discontinuities and offers the full period", () => {
  const html = renderToStaticMarkup(createElement(TrafficHistoryChart, { points, title: "Débit" }));
  assert.match(html, /18\/10 09:15/);
  assert.doesNotMatch(html, /17\/10/);
  assert.doesNotMatch(html, /NaN|Infinity/);
  const path = /<path d="([^"]+)"/.exec(html)![1];
  assert.equal(path.match(/M/g)?.length, 2);
  assert.equal(path.match(/L/g)?.length, 1);
  assert.match(path, /^M50\.0,185\.0/);
  const full = renderToStaticMarkup(createElement(TrafficHistoryChart, { points, title: "Débit", fitToData: false }));
  assert.match(full, /17\/10/);
});
