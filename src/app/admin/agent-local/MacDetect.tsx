"use client";

import { useEffect, useState } from "react";
import { Apple, Cpu, Download, HelpCircle } from "lucide-react";

/* Détecte le type de Mac (Apple Silicon vs Intel) côté navigateur.
 *
 * Le User-Agent ne suffit PAS : Safari et Chrome déclarent « Intel Mac OS X »
 * même sur une puce Apple. Le signal fiable est le processeur GRAPHIQUE, lu via
 * WebGL : Apple Silicon → « Apple M… / Apple GPU » ; Intel → « Intel / AMD /
 * Radeon / Iris ». Si on ne peut pas trancher, on explique comment vérifier
 * (menu Pomme → À propos de ce Mac). */
type Chip = "detecting" | "arm" | "intel" | "unknown" | "not-mac";

function detectChip(): Chip {
  if (typeof navigator === "undefined") return "detecting";
  const ua = navigator.userAgent;
  const isMac = /Mac/i.test(ua) && !/iPhone|iPad|iPod/i.test(ua);
  if (!isMac) return "not-mac";
  try {
    const canvas = document.createElement("canvas");
    const gl = (canvas.getContext("webgl") || canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;
    if (!gl) return "unknown";
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    if (/apple\s*m\d|apple gpu|\bapple\b/i.test(renderer)) return "arm";
    if (/intel|amd|radeon|iris|nvidia|geforce/i.test(renderer)) return "intel";
    return "unknown";
  } catch {
    return "unknown";
  }
}

const DL = "/download/agent";

export default function MacDetect() {
  const [chip, setChip] = useState<Chip>("detecting");
  // Détection volontairement après le montage : navigator n'existe pas au rendu
  // serveur, et commencer par « detecting » évite tout décalage d'hydratation.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setChip(detectChip()), []);

  // Pas un Mac (Windows, etc.) : la carte Windows plus bas suffit.
  if (chip === "not-mac") return null;

  if (chip === "arm" || chip === "intel") {
    const arm = chip === "arm";
    return (
      <div className="mt-6 flex flex-wrap items-center gap-4 rounded-2xl border border-ink bg-ink p-5 text-white">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand">
          {arm ? <Apple aria-hidden="true" className="h-5 w-5 text-ink" /> : <Cpu aria-hidden="true" className="h-5 w-5 text-ink" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            Votre Mac : {arm ? "puce Apple Silicon (M1/M2/M3/M4)" : "processeur Intel"}
          </p>
          <p className="mt-1 text-xs text-white/70">
            Détecté automatiquement. Téléchargez la version {arm ? "Apple Silicon" : "Intel"} — ou,
            en cas de doute,{" "}
            <a className="underline" href={`${DL}/${arm ? "macos-x64.dmg" : "macos-arm64.dmg"}`}>
              l&apos;autre version
            </a>
            .
          </p>
        </div>
        <a
          href={`${DL}/${arm ? "macos-arm64.dmg" : "macos-x64.dmg"}`}
          className="inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2.5 text-sm font-semibold text-ink"
        >
          <Download aria-hidden="true" className="h-4 w-4" />
          Télécharger pour {arm ? "Apple Silicon" : "Intel"}
        </a>
      </div>
    );
  }

  // En cours, ou indétectable : on explique comment vérifier soi-même.
  return (
    <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-clay p-4">
      <HelpCircle aria-hidden="true" className="h-5 w-5 shrink-0 text-ink" />
      <p className="min-w-0 flex-1 text-sm text-ink-soft">
        {chip === "detecting" ? (
          "Détection de votre Mac…"
        ) : (
          <>
            Type de Mac non détecté. Vérifiez-le : menu <b></b> (en haut à gauche) →{" "}
            <b>À propos de ce Mac</b>. « <b>Puce Apple M…</b> » = Apple Silicon ; «{" "}
            <b>Processeur Intel</b> » = Intel.
          </>
        )}
      </p>
    </div>
  );
}
