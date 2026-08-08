"use client";

import { useId, useState } from "react";

/**
 * Courbe temporelle réutilisable — le seul graphique de séries dans le SaaS.
 *
 * POURQUOI UNE COURBE ET PLUS DES BARRES : les trois graphiques du produit
 * (activations de tickets, revenu/dépenses, ventes VPN/auto-setup) répondent
 * tous à la même question — « comment ça évolue jour après jour ». Une barre
 * répond à « combien pour CETTE catégorie » ; sur une série de quatorze ou
 * trente jours, elle force l'œil à comparer des hauteurs voisines au lieu de
 * lui donner la pente. Deux d'entre eux superposaient en plus deux séries de
 * barres l'une devant l'autre, ce qui masquait la plus courte.
 *
 * SEGMENTS DROITS, PAS DE LISSAGE : un spline inventerait des valeurs entre
 * deux jours mesurés. Les jointures arrondies suffisent à donner l'allure
 * d'une courbe sans mentir sur les données.
 *
 * Le survol est fourni PAR DÉFAUT (repère vertical + infobulle) : un graphique
 * SVG dans une page est interactif, s'en priver oblige à deviner les valeurs.
 */

export type ChartSeries = {
  key: string;
  label: string;
  /** Variable CSS de la charte : "var(--chart-1)" | "var(--chart-2)". */
  color: string;
  values: number[];
};

const W = 720;
const H = 200;
const PAD_L = 8;
const PAD_R = 8;
const PAD_T = 14;
const PAD_B = 26;

function formatValue(value: number, unit: "fcfa" | "count") {
  if (unit === "fcfa") return `${value.toLocaleString("fr-FR")} FCFA`;
  return value.toLocaleString("fr-FR");
}

/** Graduations « rondes » — 0, puis un maximum arrondi vers le haut. */
function niceMax(max: number) {
  if (max <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(max));
  return Math.ceil(max / magnitude) * magnitude;
}

export default function LineChart({
  labels,
  series,
  unit = "count",
  ariaLabel,
  emptyLabel = "Aucune donnée sur la période.",
}: {
  labels: string[];
  series: ChartSeries[];
  unit?: "fcfa" | "count";
  ariaLabel: string;
  emptyLabel?: string;
}) {
  const gradientId = useId();
  const [hover, setHover] = useState<number | null>(null);

  const points = labels.length;
  const total = series.reduce((sum, s) => sum + s.values.reduce((a, b) => a + b, 0), 0);
  if (points === 0 || total === 0) {
    return (
      <p className="mt-4 border-2 border-dashed border-line-soft px-4 py-10 text-center text-sm text-ink-soft">
        {emptyLabel}
      </p>
    );
  }

  const max = niceMax(Math.max(...series.flatMap((s) => s.values), 1));
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;
  // Un seul point ne trace pas de segment : on le centre.
  const x = (i: number) => (points === 1 ? W / 2 : PAD_L + (plotW * i) / (points - 1));
  const y = (v: number) => PAD_T + plotH - (plotH * v) / max;

  // Au plus ~7 étiquettes d'axe, sinon elles se chevauchent.
  const labelEvery = Math.max(1, Math.ceil(points / 7));

  return (
    <figure className="mt-4">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={ariaLabel}
        className="w-full touch-none"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const ratio = (event.clientX - rect.left) / rect.width;
          const index = Math.round(ratio * W * ((points - 1) / plotW) - PAD_L / plotW);
          setHover(Math.min(points - 1, Math.max(0, index)));
        }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={series[0].color} stopOpacity="0.18" />
            <stop offset="100%" stopColor={series[0].color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Grille RÉCESSIVE : elle situe, elle ne se regarde pas. */}
        {[0, 0.5, 1].map((ratio) => (
          <line
            key={ratio}
            x1={PAD_L}
            x2={W - PAD_R}
            y1={PAD_T + plotH * ratio}
            y2={PAD_T + plotH * ratio}
            stroke="var(--line-soft)"
            strokeWidth="1"
          />
        ))}
        <text x={PAD_L} y={PAD_T - 4} fontSize="10" fill="var(--ink-soft)" fontFamily="var(--font-geist-mono), monospace">
          {formatValue(max, unit)}
        </text>

        {/* Aplat sous la première série : rappelle l'identité de marque sans
            reposer sur elle pour lire la valeur. */}
        <path
          d={`M ${x(0)} ${PAD_T + plotH} ${series[0].values
            .map((v, i) => `L ${x(i)} ${y(v)}`)
            .join(" ")} L ${x(points - 1)} ${PAD_T + plotH} Z`}
          fill={`url(#${gradientId})`}
        />

        {series.map((s) => (
          <polyline
            key={s.key}
            points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
            fill="none"
            stroke={s.color}
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}

        {/* Repère de survol + pastilles sur chaque série. */}
        {hover !== null && (
          <g>
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={PAD_T}
              y2={PAD_T + plotH}
              stroke="var(--ink)"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
            {series.map((s) => (
              <circle
                key={s.key}
                cx={x(hover)}
                cy={y(s.values[hover])}
                r="4.5"
                fill={s.color}
                stroke="var(--paper)"
                strokeWidth="2"
              />
            ))}
          </g>
        )}

        {labels.map((label, i) =>
          i % labelEvery === 0 ? (
            <text
              key={label + i}
              x={x(i)}
              y={H - 8}
              textAnchor={i === 0 ? "start" : i === points - 1 ? "end" : "middle"}
              fontSize="10"
              fill="var(--ink-soft)"
              fontFamily="var(--font-geist-mono), monospace"
            >
              {label}
            </text>
          ) : null,
        )}
      </svg>

      {/* Infobulle en HTML plutôt qu'en SVG : elle hérite de la typographie du
          reste de l'interface et reste lisible sans mise à l'échelle. */}
      <figcaption className="mt-2 min-h-[1.75rem] text-sm">
        {hover !== null ? (
          <span className="inline-flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="font-mono text-xs text-ink-soft">{labels[hover]}</span>
            {series.map((s) => (
              <span key={s.key} className="inline-flex items-center gap-1.5">
                <span aria-hidden className="inline-block h-2.5 w-2.5" style={{ background: s.color }} />
                <span className="text-ink-soft">{s.label}</span>
                <strong className="font-mono text-ink">{formatValue(s.values[hover], unit)}</strong>
              </span>
            ))}
          </span>
        ) : (
          // Légende au repos. Toujours présente dès deux séries : l'identité ne
          // doit jamais reposer sur la seule couleur.
          <span className="inline-flex flex-wrap items-center gap-x-4 gap-y-1 text-ink-soft">
            {series.length > 1 ? (
              series.map((s) => (
                <span key={s.key} className="inline-flex items-center gap-1.5">
                  <span aria-hidden className="inline-block h-2.5 w-2.5" style={{ background: s.color }} />
                  {s.label}
                </span>
              ))
            ) : (
              <span className="text-xs">Survolez la courbe pour lire une journée.</span>
            )}
          </span>
        )}
      </figcaption>
    </figure>
  );
}
