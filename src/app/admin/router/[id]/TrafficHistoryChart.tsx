"use client";

import { useId, useState } from "react";
import { chartWindow, nearestChartPoint } from "./traffic-chart-window";
import type {
  TrafficChartPoint,
  TrafficCondition,
} from "@/lib/mikrotik/traffic-history";

export type ChartPeriod = TrafficCondition & {
  start: number;
  end: number | null;
};
export const trafficTime = (at: number) =>
  new Date(at).toLocaleString("fr-FR", {
    timeZone: "UTC",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
const value = (n: number | null) =>
  n === null
    ? "Indisponible"
    : n.toLocaleString("fr-FR", { maximumFractionDigits: 2 });

export default function TrafficHistoryChart({
  points: allPoints,
  title,
  users = false,
  periods = [],
  fitToData = true,
}: {
  points: TrafficChartPoint[];
  title: string;
  users?: boolean;
  periods?: ChartPeriod[];
  fitToData?: boolean;
}) {
  const id = useId();
  const [hoverAt, setHoverAt] = useState<number | null>(null);
  const points = chartWindow(allPoints, fitToData);
  const hover = hoverAt === null ? null : nearestChartPoint(points, hoverAt);
  const first = users ? "connected" : "rxMbps",
    second = users ? "exchanging" : "txMbps";
  const a = users ? "Connectés" : "Réception",
    b = users ? "Échangent des données" : "Envoi";
  const max = Math.max(
    1,
    ...points.flatMap((p) => [p[first] ?? 0, p[second] ?? 0]),
  );
  const W = 800,
    H = 220,
    L = 50,
    R = 16,
    T = 15,
    B = 35;
  const start = points[0]?.at ?? 0,
    end = points.at(-1)?.at ?? start;
  const timeX = (at: number) =>
    start === end
      ? (L + W - R) / 2
      : L + ((at - start) / (end - start)) * (W - L - R);
  const x = (i: number) => timeX(points[i].at);
  const y = (n: number) => H - B - (n / max) * (H - T - B);
  const path = (key: typeof first | typeof second) => {
    let d = "",
      pen = false;
    for (let i = 0; i < points.length; i++) {
      const n = points[i][key];
      if (n === null) {
        pen = false;
        continue;
      }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(n).toFixed(1)} `;
      pen = true;
    }
    return d;
  };
  const hasData = points.some((p) => p[first] !== null || p[second] !== null);
  const selected = hover === null ? null : points[hover];
  return (
    <section
      className="min-w-0 rounded-xl border border-line bg-paper p-4 sm:p-5"
      aria-labelledby={id}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={id} className="text-sm font-bold text-ink">
          {title}
        </h3>
        <div className="flex flex-wrap gap-4 text-xs text-ink-soft">
          <span>
            <span className="mr-1 inline-block h-2 w-2 rounded-full bg-brand-deep" />
            {a}
          </span>
          <span>
            <span className="mr-1 inline-block h-2 w-2 rounded-full bg-info" />
            {b}
          </span>
        </div>
      </div>
      {!hasData ? (
        <p className="grid min-h-44 place-items-center text-center text-sm text-ink-soft">
          Pas de relevés exploitables sur cette période.
        </p>
      ) : (
        <>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="mt-4 block w-full"
            role="img"
            aria-label={`${title}. ${users ? "Nombre de sessions" : "Débit moyen en Mbit/s"}. Les interruptions de courbe indiquent des données manquantes.`}
            onPointerLeave={() => setHoverAt(null)}
            onPointerMove={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              const px = ((e.clientX - r.left) / r.width) * W;
              setHoverAt(
                start + Math.max(0, Math.min(1, (px - L) / (W - L - R))) * (end - start),
              );
            }}
          >
            <title>{`${title} — UTC`}</title>
            {periods.map((p, i) => {
              if (p.start > end || (p.end !== null && p.end < start)) return null;
              const left = Math.max(L, timeX(p.start)),
                right = Math.min(W - R, timeX(p.end ?? end));
              return right >= left ? (
                <rect
                  key={i}
                  x={left}
                  y={T}
                  width={Math.max(2, right - left)}
                  height={H - T - B}
                  fill={
                    p.kind === "outage" ? "var(--err-soft)" : "var(--warn-soft)"
                  }
                  stroke={p.certainty === "suspected" ? "var(--warn)" : "none"}
                  strokeDasharray="3 3"
                >
                  <title>
                    {`${p.source} · ${p.kind} · ${p.certainty} : ${p.evidence}`}
                  </title>
                </rect>
              ) : null;
            })}
            {[0, 0.5, 1].map((r) => (
              <g key={r}>
                <line
                  x1={L}
                  x2={W - R}
                  y1={y(max * r)}
                  y2={y(max * r)}
                  stroke="var(--line-soft)"
                />
                <text
                  x={L - 8}
                  y={y(max * r) + 4}
                  textAnchor="end"
                  fontSize="11"
                  fill="var(--ink-soft)"
                >
                  {(max * r).toLocaleString("fr-FR", {
                    maximumFractionDigits: 1,
                  })}
                </text>
              </g>
            ))}
            <path
              d={path(first)}
              fill="none"
              stroke="var(--brand-deep)"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <path
              d={path(second)}
              fill="none"
              stroke="var(--info)"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {points.length <= 750 &&
              points.map((p, i) => (
                <g key={p.at}>
                  {p[first] !== null && (
                    <circle
                      cx={x(i)}
                      cy={y(p[first]!)}
                      r="1.5"
                      fill="var(--brand-deep)"
                    />
                  )}
                  {p[second] !== null && (
                    <circle
                      cx={x(i)}
                      cy={y(p[second]!)}
                      r="1.5"
                      fill="var(--info)"
                    />
                  )}
                </g>
              ))}
            {(points.length === 1 ? [0.5] : [0, 0.25, 0.5, 0.75, 1]).map((r) => {
              const at = start + r * (end - start);
              return (
                <text
                  key={r}
                  x={timeX(at)}
                  y={H - 9}
                  textAnchor={r === 0 ? "start" : r === 1 ? "end" : "middle"}
                  fontSize="10"
                  fill="var(--ink-soft)"
                >
                  {trafficTime(at)}
                </text>
              );
            })}
            {hover !== null && (
              <line
                x1={x(hover)}
                x2={x(hover)}
                y1={T}
                y2={H - B}
                stroke="var(--ink-soft)"
                strokeDasharray="3 3"
              />
            )}
          </svg>
          <p className="min-h-5 text-xs text-ink-soft">
            {selected
              ? `${trafficTime(selected.at)} UTC · ${a} : ${value(selected[first])}${users ? "" : " Mbit/s"} · ${b} : ${value(selected[second])}${users ? "" : " Mbit/s"}`
              : "Survolez la courbe pour consulter un relevé. Horaires UTC."}
          </p>
        </>
      )}
    </section>
  );
}
