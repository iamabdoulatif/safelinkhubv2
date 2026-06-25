"use client";

import { useActionState, useEffect, useState } from "react";
import { X } from "lucide-react";
import { createFloatTransaction } from "@/lib/float/actions";

export default function FloatTransactionModal({
  type,
}: {
  type: "deposit" | "withdrawal";
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    createFloatTransaction,
    undefined,
  );

  useEffect(() => {
    if (state?.success) setOpen(false);
  }, [state]);

  const isDeposit = type === "deposit";

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={
          isDeposit
            ? "rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
            : "rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        }
      >
        {isDeposit ? "+ Dépôt" : "- Retrait"}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form
            action={formAction}
            className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl"
          >
            <input type="hidden" name="type" value={type} />
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">
                {isDeposit ? "Déposer dans le solde flottant" : "Retirer du solde flottant"}
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
                  Montant (FCFA)
                </label>
                <input
                  name="amount"
                  type="number"
                  min={1}
                  required
                  placeholder="10000"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Note (optionnel)
                </label>
                <input
                  name="note"
                  placeholder="Ex: dépôt mobile money"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
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
                disabled={pending}
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {pending ? "Enregistrement..." : "Confirmer"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
