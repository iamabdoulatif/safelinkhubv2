"use client";

import { useActionState } from "react";
import { Check, Loader2, X } from "lucide-react";
import { updateProfileName } from "@/lib/auth/actions";

export default function ProfileNameForm({ currentName }: { currentName: string }) {
  const [state, formAction, pending] = useActionState(updateProfileName, null);

  return (
    <form action={formAction} className="space-y-3">
      <div>
        <label htmlFor="profile-name" className="mb-1.5 block text-sm font-medium text-ink">
          Nom complet
        </label>
        <input
          id="profile-name"
          name="name"
          defaultValue={currentName}
          required
          autoComplete="name"
          className="field w-full"
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="btn btn-md btn-secondary flex items-center gap-1.5"
        >
          {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {pending ? "Enregistrement..." : "Enregistrer"}
        </button>
        <div role="status" aria-live="polite" className="text-xs">
          {!pending && state?.success && (
            <span className="flex items-center gap-1 text-ok">
              <Check className="h-3.5 w-3.5" /> Mis à jour.
            </span>
          )}
          {!pending && state && !state.success && (
            <span className="flex items-center gap-1 text-err">
              <X className="h-3.5 w-3.5" /> {state.error}
            </span>
          )}
        </div>
      </div>
    </form>
  );
}
