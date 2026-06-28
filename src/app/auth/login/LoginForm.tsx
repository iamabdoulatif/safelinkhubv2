"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { Mail, Lock, AlertCircle } from "lucide-react";
import { login } from "@/lib/auth/actions";

export default function LoginForm() {
  const searchParams = useSearchParams();
  const callback = searchParams.get("callback") ?? "/admin";
  const [state, formAction, pending] = useActionState(login, undefined);

  return (
    <form action={formAction} className="mt-8 animate-fade-in-up space-y-5">
      <input type="hidden" name="callback" value={callback} />

      {state?.error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-600">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <p>{state.error}</p>
        </div>
      )}

      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">
          Email
        </label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="email"
            name="email"
            required
            placeholder="jean.dupont@exemple.com"
            className="w-full rounded-lg border border-slate-300 bg-white py-3 pl-10 pr-3 text-sm placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label className="block text-sm font-medium text-slate-700">
            Mot de passe
          </label>
        </div>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="password"
            name="password"
            required
            className="w-full rounded-lg border border-slate-300 bg-white py-3 pl-10 pr-3 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>
        <div className="mt-1.5 text-right">
          <a href="#" className="text-sm text-emerald-600 hover:text-orange-500">
            Mot de passe oublié ?
          </a>
        </div>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-slate-950 py-3 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
      >
        {pending ? "Connexion en cours..." : "Connexion"}
      </button>
    </form>
  );
}
