"use client";

import { useActionState } from "react";
import { updateOrganizationName } from "@/lib/organizations/actions";

export default function RenameOrgForm({ currentName }: { currentName: string }) {
  const [state, formAction, pending] = useActionState(updateOrganizationName, undefined);

  return (
    <form action={formAction} className="border border-line bg-paper p-6 rounded-xl">
      <h2 className="font-semibold text-ink">Nom de l&apos;organisation</h2>
      <p className="mt-1 text-sm text-ink-soft">
        Affiché dans la barre latérale et sur la page de facturation.
      </p>

      {state?.error && (
        <p className="mt-3 rounded-lg bg-err-soft px-3 py-2 text-sm text-err">{state.error}</p>
      )}
      {state?.success && (
        <p className="mt-3 rounded-lg bg-clay px-3 py-2 text-sm text-ok">
          Nom mis à jour.
        </p>
      )}

      <div className="mt-4 flex gap-2">
        <input
          name="name"
          required
          defaultValue={currentName}
          className="field flex-1"
        />
        <button
          type="submit"
          disabled={pending}
          className="btn btn-md btn-secondary"
        >
          {pending ? "Enregistrement..." : "Enregistrer"}
        </button>
      </div>
    </form>
  );
}
