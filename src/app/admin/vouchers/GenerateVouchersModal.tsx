"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, X } from "lucide-react";
import { generateVouchers } from "@/lib/vouchers/actions";

type PackageOption = { id: string; name: string };
type RouterOption = { id: string; name: string; status: string };

export default function GenerateVouchersModal({
  packages,
  routers,
}: {
  packages: PackageOption[];
  routers: RouterOption[];
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
        className="rounded-md border border-line-soft bg-paper px-4 py-2 text-sm font-medium text-ink hover:bg-clay"
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
            className="relative w-full max-w-sm rounded-xl bg-paper p-6"
            role="dialog"
            aria-modal="true"
            aria-labelledby="generate-vouchers-title"
          >
            <div className="flex items-center justify-between">
              <h2 id="generate-vouchers-title" className="text-lg font-semibold text-ink">
                Générer des vouchers
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
                    Vouchers générés avec succès.
                  </span>
                </p>
              )}
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-ink">
                  Forfait
                </label>
                <select
                  ref={firstSelectRef}
                  name="packageId"
                  required
                  className="w-full rounded-md border border-line-soft px-3 py-2 text-sm focus:border-ok focus:ring-2 focus:ring-ink/20 focus:outline-none"
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
                <label className="mb-1 block text-sm font-medium text-ink">
                  Routeur
                </label>
                <select
                  name="routerId"
                  required
                  className="w-full rounded-md border border-line-soft px-3 py-2 text-sm focus:border-ok focus:ring-2 focus:ring-ink/20 focus:outline-none"
                >
                  {routers.length === 0 && <option value="">Aucun routeur</option>}
                  {routers.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                      {r.status !== "online" ? " (hors ligne)" : ""}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-ink-soft">
                  Les codes sont créés directement sur ce MikroTik. Il doit être en ligne.
                </p>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-ink">
                  Quantité
                </label>
                <input
                  name="quantity"
                  type="number"
                  min={1}
                  max={200}
                  defaultValue={10}
                  required
                  className="w-full rounded-md border border-line-soft px-3 py-2 text-sm focus:border-ok focus:ring-2 focus:ring-ink/20 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-ink">
                  Note
                </label>
                <input
                  name="note"
                  placeholder="lot-test"
                  className="w-full rounded-md border border-line-soft px-3 py-2 text-sm placeholder:text-ink-soft focus:border-ok focus:ring-2 focus:ring-ink/20 focus:outline-none"
                />
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
                disabled={pending || packages.length === 0 || routers.length === 0}
                className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-brand disabled:opacity-60"
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
