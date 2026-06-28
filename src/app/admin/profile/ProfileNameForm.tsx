"use client";

import { useActionState } from "react";
import { Check, Loader2, X } from "lucide-react";
import { updateProfileName } from "@/lib/auth/actions";

export default function ProfileNameForm({ currentName }: { currentName: string }) {
  const [state, formAction, pending] = useActionState(updateProfileName, null);

  return (
    <form action={formAction} className="space-y-3">
      <div>
        <label htmlFor="profile-name" className="mb-1.5 block text-sm font-medium text-slate-700">
          Nom complet
        </label>
        <input
          id="profile-name"
          name="name"
          defaultValue={currentName}
          required
          autoComplete="name"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="flex items-center gap-1.5 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {pending ? "Enregistrement..." : "Enregistrer"}
        </button>
        <div role="status" aria-live="polite" className="text-xs">
          {!pending && state?.success && (
            <span className="flex items-center gap-1 text-emerald-600">
              <Check className="h-3.5 w-3.5" /> Mis à jour.
            </span>
          )}
          {!pending && state && !state.success && (
            <span className="flex items-center gap-1 text-red-600">
              <X className="h-3.5 w-3.5" /> {state.error}
            </span>
          )}
        </div>
      </div>
    </form>
  );
}
