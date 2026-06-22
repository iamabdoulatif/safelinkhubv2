"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { login } from "@/lib/auth/actions";

export default function LoginForm() {
  const searchParams = useSearchParams();
  const callback = searchParams.get("callback") ?? "/admin";
  const [state, formAction, pending] = useActionState(login, undefined);

  return (
    <form action={formAction} className="mt-8 space-y-4">
      <input type="hidden" name="callback" value={callback} />

      {state?.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
          {state.error}
        </p>
      )}

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">
          Email
        </label>
        <input
          type="email"
          name="email"
          required
          placeholder="jean.dupont@exemple.com"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
        />
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <label className="block text-sm font-medium text-slate-700">
            Mot de passe
          </label>
        </div>
        <input
          type="password"
          name="password"
          required
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
        />
        <div className="mt-1 text-right">
          <a href="#" className="text-sm text-slate-500 hover:text-slate-700">
            Mot de passe oublié ?
          </a>
        </div>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-slate-900 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
      >
        {pending ? "Connexion en cours..." : "Connexion"}
      </button>
    </form>
  );
}
