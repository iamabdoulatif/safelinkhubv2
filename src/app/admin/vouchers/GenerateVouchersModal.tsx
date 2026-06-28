"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, X } from "lucide-react";
import { generateVouchers } from "@/lib/vouchers/actions";

type PackageOption = { id: string; name: string };

export default function GenerateVouchersModal({
  packages,
}: {
  packages: PackageOption[];
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    generateVouchers,
    undefined,
  );

  const [prevState, setPrevState] = useState(state);
  if (state !== prevState) {
    setPrevState(state);
    if (state?.success) setOpen(false);
  }

  const firstSelectRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (open) {
      firstSelectRef.current?.focus();
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
        className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        Générer des vouchers
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
            className="relative w-full max-w-sm rounded-xl bg-white p-6 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="generate-vouchers-title"
          >
            <div className="flex items-center justify-between">
              <h2 id="generate-vouchers-title" className="text-lg font-semibold text-slate-900">
                Générer des vouchers
              </h2>
              <button
                type="button"
                aria-label="Fermer"
                onClick={() => setOpen(false)}
              >
                <X className="h-5 w-5 text-slate-400" />
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
                <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                  <span className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    Vouchers générés avec succès.
                  </span>
                </p>
              )}
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Forfait
                </label>
                <select
                  ref={firstSelectRef}
                  name="packageId"
                  required
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none"
                >
                  {packages.length === 0 && <option value="">Aucun forfait</option>}
                  {packages.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Quantité
                </label>
                <input
                  name="quantity"
                  type="number"
                  min={1}
                  max={200}
                  defaultValue={10}
                  required
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Note
                </label>
                <input
                  name="note"
                  placeholder="lot-test"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={pending || packages.length === 0}
                className="rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-60"
              >
                {pending ? "Génération..." : "Générer"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
