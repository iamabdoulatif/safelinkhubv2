"use client";

import { useActionState, useState } from "react";
import { deleteOrganization } from "@/lib/organizations/actions";

export default function DangerZone({ slug }: { slug: string }) {
  const [confirming, setConfirming] = useState(false);
  const [state, formAction, pending] = useActionState(deleteOrganization, undefined);

  return (
    <div className="rounded-xl border border-red-200 bg-red-50/40 p-6">
      <h2 className="font-semibold text-red-700">Zone de danger</h2>
      <p className="mt-1 text-sm text-red-600">
        Supprime définitivement cette organisation — routeurs, vouchers, forfaits,
        utilisateurs, transactions, tout. Cette action est irréversible.
      </p>

      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="mt-4 rounded-md border border-red-300 bg-paper px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
        >
          Supprimer l&apos;organisation
        </button>
      ) : (
        <form action={formAction} className="mt-4 space-y-3">
          {state?.error && (
            <p className="rounded-md bg-red-100 px-3 py-2 text-sm text-red-700">{state.error}</p>
          )}
          <label className="block text-sm font-medium text-red-700">
            Tapez <span className="font-mono">{slug}</span> pour confirmer
          </label>
          <input
            name="confirmSlug"
            required
            placeholder={slug}
            className="w-full rounded-md border border-red-300 px-3 py-2 text-sm focus:border-red-400 focus:outline-none"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-md border border-line-soft bg-paper px-4 py-2 text-sm font-medium text-ink-soft hover:bg-clay"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
            >
              {pending ? "Suppression..." : "Supprimer définitivement"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
