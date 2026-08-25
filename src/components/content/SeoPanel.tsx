"use client";

import { useMemo } from "react";
import { Check, CircleAlert, Search, X } from "lucide-react";
import { analyseSeo, type SeoInput } from "@/lib/content/seo";

/**
 * Panneau d'analyse rédactionnelle, à côté de l'éditeur.
 *
 * Tout est calculé DANS LE NAVIGATEUR à partir des champs saisis : aucune
 * requête, aucun service tiers, et le verdict change à la frappe. Le mot-clé
 * est un champ de formulaire ordinaire — il part avec l'article et se retrouve
 * à la réouverture.
 */
export default function SeoPanel({
  keywordName,
  keyword,
  onKeywordChange,
  ...input
}: Omit<SeoInput, "keyword"> & {
  keywordName: string;
  keyword: string;
  onKeywordChange: (v: string) => void;
}) {
  const rapport = useMemo(
    () => analyseSeo({ ...input, keyword }),
    [input, keyword],
  );

  const ton =
    rapport.score >= 80
      ? { texte: "text-ok", barre: "bg-ok", libelle: "Bon" }
      : rapport.score >= 50
        ? { texte: "text-warn", barre: "bg-warn", libelle: "À améliorer" }
        : { texte: "text-err", barre: "bg-err", libelle: "Insuffisant" };

  return (
    <aside className="rounded-xl border border-line bg-paper p-4">
      <h2 className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wider text-ink">
        <Search className="h-4 w-4 text-brand-deep" />
        Référencement
      </h2>

      <label className="mt-3 block">
        <span className="block text-xs font-semibold uppercase tracking-wider text-ink-soft">
          Mot-clé principal
        </span>
        <input
          name={keywordName}
          value={keyword}
          onChange={(e) => onKeywordChange(e.target.value)}
          placeholder="ex. gestion de projet"
          className="mt-1 w-full rounded-md border border-line-soft bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
        />
        <span className="mt-1 block text-xs text-ink-soft">
          L&apos;expression que vos lecteurs taperont dans Google.
        </span>
      </label>

      <div className="mt-4">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-soft">Score</span>
          <span className={`text-sm font-bold tabular-nums ${ton.texte}`}>
            {rapport.score} / 100 · {ton.libelle}
          </span>
        </div>
        <div className="mt-1.5 h-2 rounded-full bg-clay">
          <div
            className={`h-full rounded-full transition-all ${ton.barre}`}
            style={{ width: `${rapport.score}%` }}
          />
        </div>
        {/* Ce que le score EST, pour qu'il ne se lise pas comme une promesse. */}
        <p className="mt-1.5 text-[11px] leading-4 text-ink-soft">
          Part des contrôles réussis ci-dessous. C&apos;est une relecture de forme,
          pas une prévision de classement.
        </p>
      </div>

      <ul className="mt-4 space-y-2" role="list">
        {rapport.checks.map((c) => (
          <li key={c.id} className="flex items-start gap-2">
            {c.state === "ok" ? (
              <Check aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ok" />
            ) : c.state === "warn" ? (
              <CircleAlert aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" />
            ) : (
              <X aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-err" />
            )}
            <span className="min-w-0">
              <span className="block text-xs font-medium text-ink">{c.label}</span>
              {c.state !== "ok" && (
                <span className="block text-[11px] leading-4 text-ink-soft">{c.hint}</span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </aside>
  );
}
