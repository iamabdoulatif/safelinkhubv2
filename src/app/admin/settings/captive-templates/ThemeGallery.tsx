"use client";

/*
 * Galerie de thèmes prêts à l'emploi pour le portail captif. Chaque thème
 * pré-remplit un modèle paramétrique (couleurs + textes) via l'action
 * createCaptiveTemplate existante — le modèle créé apparaît ensuite dans
 * la liste ci-dessous où il reste entièrement personnalisable.
 *
 * Les aperçus sont volontairement des aplats (style Bitume côté admin) :
 * deux bandes de couleur représentent fond + accent du thème.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Eye, Loader2, Plus } from "lucide-react";
import { createCaptiveTemplate } from "@/lib/captive-templates/actions";

type Theme = {
  key: string;
  name: string;
  primaryColor: string;
  backgroundColor: string;
  textColor: string;
  title: string;
};

const THEMES: Theme[] = [
  {
    key: "clean",
    name: "Clean",
    primaryColor: "#1C1917",
    backgroundColor: "#FBFAF8",
    textColor: "#1C1917",
    title: "Bienvenue sur le réseau Wi-Fi",
  },
  {
    key: "dark",
    name: "Dark",
    primaryColor: "#EAB308",
    backgroundColor: "#141210",
    textColor: "#FAF9F7",
    title: "Connexion au réseau",
  },
  {
    key: "gradient",
    name: "Gradient",
    primaryColor: "#7C3AED",
    backgroundColor: "#EDE9FE",
    textColor: "#312E81",
    title: "Wi-Fi haut débit",
  },
  {
    key: "neon",
    name: "Neon",
    primaryColor: "#22D3EE",
    backgroundColor: "#0F172A",
    textColor: "#E2E8F0",
    title: "Accès internet rapide",
  },
  {
    key: "ocean",
    name: "Ocean",
    primaryColor: "#0284C7",
    backgroundColor: "#E0F2FE",
    textColor: "#0C4A6E",
    title: "Bienvenue à bord",
  },
  {
    key: "sunset",
    name: "Sunset",
    primaryColor: "#EA580C",
    backgroundColor: "#FFF7ED",
    textColor: "#7C2D12",
    title: "Connectez-vous en un instant",
  },
];

function ThemePreview({ theme }: { theme: Theme }) {
  return (
    <div
      aria-hidden="true"
      className="flex h-28 flex-col items-center justify-center gap-1.5 border-2 border-line"
      style={{ backgroundColor: theme.backgroundColor }}
    >
      <span
        className="block h-2 w-24"
        style={{ backgroundColor: theme.textColor }}
      />
      <span
        className="block h-1.5 w-16 opacity-60"
        style={{ backgroundColor: theme.textColor }}
      />
      <span className="mt-1.5 block h-5 w-28 border" style={{ borderColor: theme.textColor, opacity: 0.5 }} />
      <span
        className="mt-1 flex h-6 w-28 items-center justify-center text-[9px] font-bold"
        style={{
          backgroundColor: theme.primaryColor,
          color: theme.backgroundColor,
        }}
      >
        SE CONNECTER
      </span>
    </div>
  );
}

export default function ThemeGallery({ existingNames }: { existingNames: string[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState<Theme | null>(null);

  const lowerNames = existingNames.map((n) => n.toLowerCase());

  function applyTheme(theme: Theme) {
    setPendingKey(theme.key);
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("name", `Thème ${theme.name}`);
      fd.set("primaryColor", theme.primaryColor);
      fd.set("backgroundColor", theme.backgroundColor);
      fd.set("title", theme.title);
      fd.set("subtitle", "Entrez votre code d'accès pour vous connecter.");
      fd.set("buttonLabel", "Se connecter");
      fd.set("voucherFieldLabel", "Code d'accès");
      const res = await createCaptiveTemplate(undefined, fd);
      setPendingKey(null);
      if (res?.error) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="mt-8">
      <h2 className="font-display text-lg font-bold text-ink">Galerie de thèmes</h2>
      <p className="mt-1 text-sm text-ink-soft">
        Partez d&apos;un thème prêt à l&apos;emploi — il est créé comme modèle
        personnalisable puis assignable à vos routeurs ci-dessous.
      </p>

      {error && (
        <p role="alert" className="mt-3 border-2 border-err bg-err-soft px-3 py-2 text-sm font-medium text-err">
          {error}
        </p>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {THEMES.map((theme) => {
          const created = lowerNames.includes(`thème ${theme.name}`.toLowerCase());
          const busy = isPending && pendingKey === theme.key;
          return (
            <article
              key={theme.key}
              className={`border-2 bg-paper p-3 transition-transform duration-150 ${
                created ? "border-line" : "border-line-soft hover:border-line"
              }`}
            >
              <ThemePreview theme={theme} />
              <div className="mt-3 flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 font-display text-sm font-bold text-ink">
                  {theme.name}
                  {created && (
                    <span className="flex items-center gap-1 bg-brand px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase text-[#1C1917]">
                      <Check aria-hidden="true" className="h-3 w-3" />
                      Créé
                    </span>
                  )}
                </h3>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPreviewing(theme)}
                    className="flex items-center gap-1 border-2 border-line bg-paper px-2 py-1 text-xs font-bold text-ink transition-colors duration-150 hover:bg-clay"
                  >
                    <Eye aria-hidden="true" className="h-3.5 w-3.5" />
                    Preview
                  </button>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => applyTheme(theme)}
                    className="flex items-center gap-1 border-2 border-line bg-brand px-2 py-1 text-xs font-bold text-[#1C1917] transition-colors duration-150 hover:bg-ink hover:text-paper disabled:opacity-50"
                  >
                    {busy ? (
                      <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Plus aria-hidden="true" className="h-3.5 w-3.5" />
                    )}
                    Utiliser
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {/* Aperçu plein format */}
      {previewing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Aperçu du thème ${previewing.name}`}
          onClick={(e) => {
            if (e.target === e.currentTarget) setPreviewing(null);
          }}
        >
          <div className="w-full max-w-sm border-2 border-line bg-paper">
            <div className="flex items-center justify-between border-b-2 border-line px-4 py-2.5">
              <p className="font-display text-sm font-bold text-ink">Thème {previewing.name}</p>
              <button
                type="button"
                autoFocus
                onClick={() => setPreviewing(null)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setPreviewing(null);
                }}
                className="border-2 border-line px-2 py-0.5 text-xs font-bold text-ink hover:bg-clay"
              >
                Fermer
              </button>
            </div>
            <div
              className="flex flex-col items-center px-6 py-10 text-center"
              style={{ backgroundColor: previewing.backgroundColor, color: previewing.textColor }}
            >
              <p className="text-lg font-bold">{previewing.title}</p>
              <p className="mt-1 text-xs opacity-70">
                Entrez votre code d&apos;accès pour vous connecter.
              </p>
              <div
                className="mt-5 w-full border px-3 py-2 text-left text-xs opacity-70"
                style={{ borderColor: previewing.textColor }}
              >
                Code d&apos;accès
              </div>
              <div
                className="mt-3 w-full px-3 py-2 text-sm font-bold"
                style={{
                  backgroundColor: previewing.primaryColor,
                  color: previewing.backgroundColor,
                }}
              >
                Se connecter
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
