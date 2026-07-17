"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, X } from "lucide-react";
import { createPackage } from "@/lib/packages/actions";

export default function CreatePackageModal({
  routers,
}: {
  routers: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(createPackage, undefined);

  const [prevState, setPrevState] = useState(state);
  if (state !== prevState) {
    setPrevState(state);
    if (state?.success) setOpen(false);
  }

  const firstInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      firstInputRef.current?.focus();
    }
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

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-brand"
      >
        + Créer un forfait
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
            className="relative max-h-[90dvh] overflow-y-auto w-full max-w-md rounded-xl bg-paper p-6"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-package-title"
          >
            <div className="flex items-center justify-between">
              <h2 id="create-package-title" className="text-lg font-semibold text-ink">
                Créer un forfait Hotspot
              </h2>
              <button
                type="button"
                aria-label="Fermer"
                onClick={() => setOpen(false)}
              >
                <X className="h-5 w-5 text-ink-soft" />
              </button>
            </div>

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
                    Forfait créé avec succès.
                  </span>
                </p>
              )}
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-ink">
                  Nom du forfait
                </label>
                <input
                  ref={firstInputRef}
                  name="name"
                  required
                  placeholder="test123"
                  className="w-full rounded-md border border-line-soft px-3 py-2 text-sm focus:border-ok focus:ring-2 focus:ring-ink/20 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-ink">
                  Zone / Routeur
                </label>
                <select
                  name="routerId"
                  defaultValue=""
                  className="w-full rounded-md border border-line-soft px-3 py-2 text-sm focus:border-ok focus:ring-2 focus:ring-ink/20 focus:outline-none"
                >
                  <option value="">Tous les routeurs (global)</option>
                  {routers.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-ink-soft">
                  Le portail captif d&apos;un routeur n&apos;affiche que ses
                  forfaits. « Global » = visible sur les routeurs sans forfait
                  propre.
                </p>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-ink">
                  Durée du forfait
                </label>
                <div className="flex gap-2">
                  <input
                    name="durationValue"
                    type="number"
                    min={1}
                    required
                    defaultValue={5}
                    className="w-20 rounded-md border border-line-soft px-3 py-2 text-sm focus:border-ok focus:ring-2 focus:ring-ink/20 focus:outline-none"
                  />
                  <select
                    name="durationUnit"
                    className="flex-1 rounded-md border border-line-soft px-3 py-2 text-sm focus:border-ok focus:ring-2 focus:ring-ink/20 focus:outline-none"
                  >
                    <option value="Minutes">Minutes</option>
                    <option value="Hours">Heures</option>
                    <option value="Days">Jours</option>
                    <option value="Weeks">Semaines</option>
                    <option value="Months">Mois</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-ink">
                  Limites de débit (Mbps)
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="mb-1 text-xs text-ink-soft">Débit montant</p>
                    <input
                      name="uploadMbps"
                      type="number"
                      min={1}
                      defaultValue={4}
                      className="w-full rounded-md border border-line-soft px-3 py-2 text-sm focus:border-ok focus:ring-2 focus:ring-ink/20 focus:outline-none"
                    />
                  </div>
                  <div>
                    <p className="mb-1 text-xs text-ink-soft">
                      Débit descendant
                    </p>
                    <input
                      name="downloadMbps"
                      type="number"
                      min={1}
                      defaultValue={4}
                      className="w-full rounded-md border border-line-soft px-3 py-2 text-sm focus:border-ok focus:ring-2 focus:ring-ink/20 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-ink">
                  Prix
                </label>
                <input
                  name="price"
                  type="number"
                  min={500}
                  required
                  placeholder="Min 500"
                  className="w-full rounded-md border border-line-soft px-3 py-2 text-sm placeholder:text-ink-soft focus:border-ok focus:ring-2 focus:ring-ink/20 focus:outline-none"
                />
                <p className="mt-1 text-xs text-ink-soft">
                  Prix minimum : FCFA 500
                </p>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-ink">
                  Début de la facturation
                </label>
                <select
                  name="billingStartsOn"
                  className="w-full rounded-md border border-line-soft px-3 py-2 text-sm focus:border-ok focus:ring-2 focus:ring-ink/20 focus:outline-none"
                >
                  <option value="Upon First Use">À la première utilisation</option>
                  <option value="Upon Purchase">À l&apos;achat</option>
                </select>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md border border-line-soft px-4 py-2 text-sm font-medium text-ink-soft hover:bg-clay"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={pending}
                className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-brand disabled:opacity-60"
              >
                {pending ? "Création..." : "Créer le forfait"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
