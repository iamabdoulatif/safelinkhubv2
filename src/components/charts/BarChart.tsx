"use client";

import { useState } from "react";

/**
 * Histogramme de catégories — un compteur, une barre par MOIS.
 *
 * LineChart porte une note qui explique pourquoi les séries JOURNALIÈRES du
 * produit sont des courbes : sur quatorze ou trente jours, la barre force à
 * comparer des hauteurs voisines au lieu de donner la pente. Elle ajoute que
 * la barre répond à « combien pour CETTE catégorie » — et c'est exactement le
 * cas ici : six mois sont six catégories discrètes, qu'on lit en les comparant
 * l'une à l'autre, pas en suivant une tendance jour après jour. Les deux
 * composants ne se contredisent donc pas, ils couvrent deux questions.
 *
 * Le survol est fourni par défaut : un graphique muet oblige à deviner les
 * valeurs. Il double une information déjà accessible au clavier et aux
 * lecteurs d'écran par le tableau de secours en dessous.
 */

/** Graduations « rondes » — même règle que LineChart. */
function niceMax(max: number) {
  if (max <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(max));
  return Math.ceil(max / magnitude) * magnitude;
}

/* La mise en forme vit ICI et non chez l'appelant : DashboardView est un
   composant SERVEUR, et une fonction ne traverse pas la frontière
   serveur/client. Un discriminant suffit — c'est déjà le choix de LineChart,
   qui porte le même `unit`. */
function formatValue(value: number, unit: "fcfa" | "count") {
  if (unit === "fcfa") return `${value.toLocaleString("fr-FR")} FCFA`;
  return value.toLocaleString("fr-FR");
}

/* L'AXE est écrit en abrégé — « 500 k » et non « 500 000 FCFA ». Sur une carte
   large d'un tiers d'écran, la forme longue repliait chaque graduation sur deux
   lignes et mangeait la moitié de la place des barres. L'infobulle, elle, garde
   le montant exact : l'abrégé sert à situer, pas à lire une valeur. */
const compact = new Intl.NumberFormat("fr-FR", { notation: "compact", maximumFractionDigits: 1 });
function formatAxis(value: number, unit: "fcfa" | "count", max: number) {
  /* La décision se prend sur le MAXIMUM de l'axe, pas sur chaque graduation :
     sinon un même axe mélangeait « 15 k » et « 7 500 ». */
  if (unit === "count" || max < 10000) return value.toLocaleString("fr-FR");
  return compact.format(value);
}

export default function BarChart({
  labels,
  values,
  unit = "count",
  ariaLabel,
  emptyLabel = "Aucun mouvement sur les derniers mois.",
}: {
  /** Étiquettes déjà mises en forme (« août », « sept. »…). */
  labels: string[];
  values: number[];
  unit?: "fcfa" | "count";
  ariaLabel: string;
  emptyLabel?: string;
}) {
  const format = (v: number) => formatValue(v, unit);

  const [hover, setHover] = useState<number | null>(null);

  const total = values.reduce((a, b) => a + b, 0);
  if (labels.length === 0 || total === 0) {
    return (
      <p className="mt-4 border border-dashed border-line-soft px-4 py-8 text-center text-xs text-ink-soft">
        {emptyLabel}
      </p>
    );
  }

  const max = niceMax(Math.max(...values, 1));
  const graduations = [1, 0.75, 0.5, 0.25, 0];
  const axis = (v: number) => formatAxis(v, unit, max);

  return (
    <figure className="mt-3">
      <div className="flex gap-2">
        {/* Axe des ordonnées — quatre graduations, comme le modèle. */}
        <div
          aria-hidden="true"
          className="flex h-32 w-12 shrink-0 flex-col justify-between text-right text-[10px] tabular-nums text-ink-soft"
        >
          {graduations.map((g) => (
            <span key={g} className="-translate-y-1">
              {axis(Math.round(max * g))}
            </span>
          ))}
        </div>

        <div className="min-w-0 flex-1">
          <div
            className="relative flex h-32 items-end justify-around gap-1.5 border-b border-line"
            role="img"
            aria-label={ariaLabel}
            onMouseLeave={() => setHover(null)}
          >
            {/* Lignes de repère : elles aident à situer une hauteur, elles ne
                portent aucune donnée — d'où aria-hidden. */}
            {graduations.slice(0, 4).map((g) => (
              <span
                key={g}
                aria-hidden="true"
                className="absolute inset-x-0 border-t border-line-soft"
                style={{ bottom: `${g * 100}%` }}
              />
            ))}

            {values.map((value, i) => (
              <span
                key={labels[i] + i}
                className="group relative flex h-full flex-1 items-end justify-center"
                onMouseEnter={() => setHover(i)}
              >
                {/* Couleur posée en style : --chart-1 est un jeton de la
                    charte, pas une classe Tailwind générée. C'est déjà ainsi
                    que LineChart et /admin/analytics l'emploient. */}
                <span
                  className="w-full max-w-10 rounded-t-sm transition-opacity"
                  style={{
                    height: `${Math.max((value / max) * 100, value > 0 ? 2 : 0)}%`,
                    background: "var(--chart-1)",
                    opacity: hover === null || hover === i ? 1 : 0.55,
                  }}
                />
                {hover === i && (
                  <span className="pointer-events-none absolute -top-1 z-10 -translate-y-full whitespace-nowrap rounded-md border border-line bg-paper px-2 py-1 text-[11px] font-semibold tabular-nums text-ink shadow-lg">
                    {format(value)}
                  </span>
                )}
              </span>
            ))}
          </div>

          <div className="mt-1.5 flex justify-around gap-1.5">
            {labels.map((label, i) => (
              <span
                key={label + i}
                className="flex-1 truncate text-center text-[10px] text-ink-soft"
              >
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Secours accessible : le SVG porte un aria-label global, mais les
          valeurs mois par mois ne s'atteignent qu'au survol. Ce tableau les
          donne au clavier et aux lecteurs d'écran. */}
      <figcaption className="sr-only">
        <table>
          <caption>{ariaLabel}</caption>
          <tbody>
            {labels.map((label, i) => (
              <tr key={label + i}>
                <th scope="row">{label}</th>
                <td>{format(values[i])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </figcaption>
    </figure>
  );
}
