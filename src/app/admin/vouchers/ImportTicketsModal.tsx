"use client";

import { useEffect, useRef, useState } from "react";
import { useActionState } from "react";
import { AlertCircle, CheckCircle2, Download, X } from "lucide-react";
import { importMikhmonTickets } from "@/lib/vouchers/actions";

type RouterOption = { id: string; name: string; status: string };

// Importe dans le SaaS les tickets créés directement dans MikHmon : le SaaS lit
// les utilisateurs hotspot du (des) routeur(s) choisi(s) via le tunnel déjà
// utilisé pour la gestion, et enregistre ceux qu'il ne suit pas encore. Voir
// importMikhmonTickets (actions.ts).
export default function ImportTicketsModal({ routers }: { routers: RouterOption[] }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(importMikhmonTickets, undefined);

  const firstInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) firstInputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        const active = document.activeElement;
        if (active instanceof HTMLSelectElement) return;
        setOpen(false);
      }
    }
    if (open) {
      window.addEventListener("keydown", onKeyDown);
      return () => window.removeEventListener("keydown", onKeyDown);
    }
  }, [open]);

  // Résumé lisible du dernier import réussi.
  const summary = state?.success
    ? [
        state.imported > 0 ? `${state.imported} importé(s)` : null,
        state.adopted > 0 ? `${state.adopted} rattaché(s) à une zone` : null,
        state.alreadyTracked > 0 ? `${state.alreadyTracked} déjà suivi(s)` : null,
        state.deferred > 0 ? `${state.deferred} reporté(s) au prochain import` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-md border border-line-soft bg-paper px-4 py-2 text-sm font-medium text-ink hover:bg-clay"
      >
        <Download className="h-4 w-4" />
        Importer de MikHmon
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40"
            aria-hidden="true"
            onClick={() => setOpen(false)}
          />
          <form
            action={formAction}
            className="relative max-h-[90dvh] w-full max-w-sm overflow-y-auto rounded-xl bg-paper p-6"
            role="dialog"
            aria-modal="true"
            aria-labelledby="import-tickets-title"
          >
            <div className="flex items-center justify-between">
              <h2 id="import-tickets-title" className="text-lg font-semibold text-ink">
                Importer les tickets MikHmon
              </h2>
              <button type="button" aria-label="Fermer" onClick={() => setOpen(false)}>
                <X className="h-5 w-5 text-ink-soft" />
              </button>
            </div>

            <p className="mt-2 text-sm text-ink-soft">
              Récupère les tickets créés directement dans MikHmon (utilisateurs
              hotspot du routeur) et les ajoute au SaaS. Les tickets déjà suivis
              sont ignorés — vous pouvez relancer sans risque.
            </p>

            <div className="mt-4" aria-live="polite">
              {state?.error && (
                <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
                  <span className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {state.error}
                  </span>
                </p>
              )}
              {state?.success && (
                <p className="rounded-md bg-clay px-3 py-2 text-sm text-ok">
                  <span className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    {summary || "Aucun nouveau ticket à importer."}
                  </span>
                </p>
              )}
              {state?.success && state.routerErrors && state.routerErrors.length > 0 && (
                <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  Incidents : {state.routerErrors.join(" ; ")}
                </p>
              )}
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-ink">
                  Zones WiFi (routeurs) à scanner
                </label>
                {routers.length === 0 ? (
                  <p className="rounded-md border border-line-soft px-3 py-2 text-sm text-ink-soft">
                    Aucun routeur.
                  </p>
                ) : (
                  <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-line-soft p-2">
                    {routers.map((r, i) => (
                      <label
                        key={r.id}
                        className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-clay"
                      >
                        <input
                          ref={i === 0 ? firstInputRef : undefined}
                          type="checkbox"
                          name="routerIds"
                          value={r.id}
                          defaultChecked={i === 0}
                        />
                        <span className="text-ink">{r.name}</span>
                        {r.status !== "online" && (
                          <span className="text-xs text-ink-soft">(hors ligne)</span>
                        )}
                      </label>
                    ))}
                  </div>
                )}
                <p className="mt-1 text-xs text-ink-soft">
                  Chaque routeur coché doit être en ligne. Un code présent sur
                  plusieurs zones est rattaché à toutes.
                </p>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-ink">
                  Note <span className="font-normal text-ink-soft">(optionnel)</span>
                </label>
                <input
                  name="note"
                  placeholder="ex : import mikhmon"
                  className="w-full rounded-md border border-line-soft px-3 py-2 text-sm placeholder:text-ink-soft focus:border-ok focus:ring-2 focus:ring-ink/20 focus:outline-none"
                />
                <p className="mt-1 text-xs text-ink-soft">
                  Étiquette posée sur les tickets importés, pour les repérer.
                </p>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md border border-line-soft px-4 py-2 text-sm font-medium text-ink-soft hover:bg-clay"
              >
                Fermer
              </button>
              <button
                type="submit"
                disabled={pending || routers.length === 0}
                className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-brand disabled:opacity-60"
              >
                {pending ? "Import en cours..." : "Importer"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
