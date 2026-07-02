"use client";

import { useActionState } from "react";
import { updateOrganizationName } from "@/lib/organizations/actions";

export default function RenameOrgForm({ currentName }: { currentName: string }) {
  const [state, formAction, pending] = useActionState(updateOrganizationName, undefined);

  return (
    <form action={formAction} className="border-2 border-line bg-paper p-6">
      <h2 className="font-semibold text-ink">Nom de l&apos;organisation</h2>
      <p className="mt-1 text-sm text-ink-soft">
        Affiché dans la barre latérale et sur la page de facturation.
      </p>

      {state?.error && (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{state.error}</p>
      )}
      {state?.success && (
        <p className="mt-3 rounded-md bg-clay px-3 py-2 text-sm text-ok">
          Nom mis à jour.
        </p>
      )}

      <div className="mt-4 flex gap-2">
        <input
          name="name"
          required
          defaultValue={currentName}
          className="flex-1 rounded-md border border-line-soft px-3 py-2 text-sm focus:border-line-soft focus:outline-none"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-[#3A362F] disabled:opacity-60"
        >
          {pending ? "Enregistrement..." : "Enregistrer"}
        </button>
      </div>
    </form>
  );
}
