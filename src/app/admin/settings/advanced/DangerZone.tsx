"use client";

import { useActionState, useState } from "react";
import { deleteOrganization } from "@/lib/organizations/actions";

export default function DangerZone({ slug }: { slug: string }) {
  const [confirming, setConfirming] = useState(false);
  const [state, formAction, pending] = useActionState(deleteOrganization, undefined);

  return (
    <div className="rounded-xl border border-err bg-err-soft/40 p-6">
      <h2 className="font-semibold text-err">Zone de danger</h2>
      <p className="mt-1 text-sm text-err">
        Supprime définitivement cette organisation — routeurs, vouchers, forfaits,
        utilisateurs, transactions, tout. Cette action est irréversible.
      </p>

      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="mt-4 rounded-md border border-err bg-paper px-4 py-2 text-sm font-medium text-err hover:bg-err-soft"
        >
          Supprimer l&apos;organisation
        </button>
      ) : (
        <form action={formAction} className="mt-4 space-y-3">
          {state?.error && (
            <p className="rounded-md bg-err-soft px-3 py-2 text-sm text-err">{state.error}</p>
          )}
          <label className="block text-sm font-medium text-err">
            Tapez <span className="font-mono">{slug}</span> pour confirmer
          </label>
          <input
            name="confirmSlug"
            required
            placeholder={slug}
            className="w-full rounded-md border border-err px-3 py-2 text-sm focus:border-err focus:outline-none"
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
              className="rounded-md bg-err px-4 py-2 text-sm font-medium text-white hover:bg-ink disabled:opacity-60"
            >
              {pending ? "Suppression..." : "Supprimer définitivement"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
