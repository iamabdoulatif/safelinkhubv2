"use client";

import { useActionState, useState } from "react";
import { X } from "lucide-react";
import { addWalletFunds } from "@/lib/wallet/actions";

export default function WalletTopupModal() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(addWalletFunds, undefined);

  // Close the modal the moment the action succeeds — same pattern as
  // FloatTransactionModal: react during render instead of in an effect.
  const [prevState, setPrevState] = useState(state);
  if (state !== prevState) {
    setPrevState(state);
    if (state?.success) setOpen(false);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-md bg-brand-deep px-4 py-2 text-sm font-medium text-white hover:bg-brand-deep"
      >
        + Ajouter des fonds
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form
            action={formAction}
            className="w-full max-w-sm rounded-xl bg-paper p-6"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-ink">
                Ajouter des fonds au portefeuille
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
                  Montant (FCFA)
                </label>
                <input
                  name="amount"
                  type="number"
                  min={1}
                  required
                  placeholder="5000"
                  className="w-full rounded-md border border-line-soft px-3 py-2 text-sm focus:border-line-soft focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-ink">
                  Note (optionnel)
                </label>
                <input
                  name="note"
                  placeholder="Ex: virement reçu le 27/06"
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
                {pending ? "Enregistrement..." : "Confirmer"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
