"use client";

import { useActionState } from "react";
import { User, Mail, Lock, AlertCircle } from "lucide-react";
import { register } from "@/lib/auth/actions";

export default function RegisterForm() {
  const [state, formAction, pending] = useActionState(register, undefined);

  return (
    <form action={formAction} className="mt-8 animate-fade-in-up space-y-5">
      {state?.error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-600">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <p>{state.error}</p>
        </div>
      )}

      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">
          Nom complet
        </label>
        <div className="relative">
          <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            name="name"
            required
            autoComplete="name"
            placeholder="Jean Dupont"
            className="w-full rounded-lg border border-slate-300 bg-white py-3 pl-10 pr-3 text-sm placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none"
          />
        </div>
      </div>

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
            autoComplete="email"
            spellCheck={false}
            placeholder="jean.dupont@exemple.com"
            className="w-full rounded-lg border border-slate-300 bg-white py-3 pl-10 pr-3 text-sm placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none"
          />
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">
          Mot de passe
        </label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="password"
            name="password"
            required
            minLength={6}
            className="w-full rounded-lg border border-slate-300 bg-white py-3 pl-10 pr-3 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-slate-950 py-3 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
      >
        {pending ? "Création du compte..." : "S'inscrire"}
      </button>
    </form>
  );
}
