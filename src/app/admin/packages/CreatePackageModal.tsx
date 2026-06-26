"use client";

import { useActionState, useState } from "react";
import { X } from "lucide-react";
import { createPackage } from "@/lib/packages/actions";

export default function CreatePackageModal() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(createPackage, undefined);

  // Close the modal the moment the action succeeds — adjusted during render
  // (the React-recommended alternative to setState-in-effect) by tracking
  // the previous action result and reacting only when it actually changes.
  const [prevState, setPrevState] = useState(state);
  if (state !== prevState) {
    setPrevState(state);
    if (state?.success) setOpen(false);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
      >
        + Créer un forfait
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form
            action={formAction}
            className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">
                Créer un forfait Hotspot
              </h2>
              <button type="button" onClick={() => setOpen(false)}>
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>

            {state?.error && (
              <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
                {state.error}
              </p>
            )}

            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Nom du forfait
                </label>
                <input
                  name="name"
                  required
                  placeholder="test123"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Durée du forfait
                </label>
                <div className="flex gap-2">
                  <input
                    name="durationValue"
                    type="number"
                    min={1}
                    required
                    defaultValue={5}
                    className="w-20 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
                  />
                  <select
                    name="durationUnit"
                    className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
                  >
                    <option value="Hours">Heures</option>
                    <option value="Days">Jours</option>
                    <option value="Weeks">Semaines</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Limites de débit (Mbps)
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="mb-1 text-xs text-slate-400">Débit montant</p>
                    <input
                      name="uploadMbps"
                      type="number"
                      min={1}
                      defaultValue={4}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
                    />
                  </div>
                  <div>
                    <p className="mb-1 text-xs text-slate-400">
                      Débit descendant
                    </p>
                    <input
                      name="downloadMbps"
                      type="number"
                      min={1}
                      defaultValue={4}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Prix
                </label>
                <input
                  name="price"
                  type="number"
                  min={500}
                  required
                  placeholder="Min 500"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
                />
                <p className="mt-1 text-xs text-slate-400">
                  Prix minimum : FCFA 500
                </p>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Début de la facturation
                </label>
                <select
                  name="billingStartsOn"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
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
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={pending}
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
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
