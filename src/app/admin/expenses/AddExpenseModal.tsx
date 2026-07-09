"use client";

import { useActionState, useState } from "react";
import { X } from "lucide-react";
import { createExpense } from "@/lib/expenses/actions";

const CATEGORIES = [
  "Internet / Bande passante",
  "Électricité",
  "Équipement",
  "Loyer",
  "Salaires",
  "Maintenance",
  "Autre",
];

export default function AddExpenseModal() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(createExpense, undefined);

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
        className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-[#3A362F]"
      >
        + Ajouter une dépense
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form
            action={formAction}
            className="max-h-[90dvh] overflow-y-auto w-full max-w-sm rounded-xl bg-paper p-6"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-ink">
                Ajouter une dépense
              </h2>
              <button type="button" onClick={() => setOpen(false)}>
                <X className="h-5 w-5 text-ink-soft" />
              </button>
            </div>

            {state?.error && (
              <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
                {state.error}
              </p>
            )}

            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-ink">
                  Catégorie
                </label>
                <select
                  name="category"
                  required
                  className="w-full rounded-md border border-line-soft px-3 py-2 text-sm focus:border-line-soft focus:outline-none"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-ink">
                  Montant (FCFA)
                </label>
                <input
                  name="amount"
                  type="number"
                  min={1}
                  required
                  placeholder="10000"
                  className="w-full rounded-md border border-line-soft px-3 py-2 text-sm focus:border-line-soft focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-ink">
                  Date
                </label>
                <input
                  name="expenseDate"
                  type="date"
                  defaultValue={new Date().toISOString().slice(0, 10)}
                  className="w-full rounded-md border border-line-soft px-3 py-2 text-sm focus:border-line-soft focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-ink">
                  Note (optionnel)
                </label>
                <input
                  name="note"
                  placeholder="Ex: facture fournisseur"
                  className="w-full rounded-md border border-line-soft px-3 py-2 text-sm focus:border-line-soft focus:outline-none"
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
                disabled={pending}
                className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-[#3A362F] disabled:opacity-60"
              >
                {pending ? "Enregistrement..." : "Ajouter"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
