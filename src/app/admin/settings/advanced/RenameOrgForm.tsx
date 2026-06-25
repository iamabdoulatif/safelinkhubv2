"use client";

import { useActionState } from "react";
import { updateOrganizationName } from "@/lib/organizations/actions";

export default function RenameOrgForm({ currentName }: { currentName: string }) {
  const [state, formAction, pending] = useActionState(updateOrganizationName, undefined);

  return (
    <form action={formAction} className="rounded-xl border border-slate-200 bg-white p-6">
      <h2 className="font-semibold text-slate-900">Nom de l&apos;organisation</h2>
      <p className="mt-1 text-sm text-slate-500">
        Affiché dans la barre latérale et sur la page de facturation.
      </p>

      {state?.error && (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{state.error}</p>
      )}
      {state?.success && (
        <p className="mt-3 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Nom mis à jour.
        </p>
      )}

      <div className="mt-4 flex gap-2">
        <input
          name="name"
          required
          defaultValue={currentName}
          className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
        >
          {pending ? "Enregistrement..." : "Enregistrer"}
        </button>
      </div>
    </form>
  );
}
