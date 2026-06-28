"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { Mail, Lock, AlertCircle, ShieldCheck } from "lucide-react";
import { login, verifyMfaLogin } from "@/lib/auth/actions";

function MfaStep() {
  const [state, formAction, pending] = useActionState(verifyMfaLogin, undefined);

  return (
    <form action={formAction} className="mt-8 animate-fade-in-up space-y-5">
      <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2.5 text-sm text-slate-600">
        <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" />
        <p>Entrez le code à 6 chiffres de votre application d&apos;authentification.</p>
      </div>

      {state?.error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-600">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <p>{state.error}</p>
        </div>
      )}

      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">
          Code de vérification
        </label>
        <input
          type="text"
          name="code"
          required
          autoFocus
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="123456 ou un code de récupération"
          className="w-full rounded-lg border border-slate-300 bg-white py-3 px-3 text-center text-lg tracking-widest placeholder:text-sm placeholder:tracking-normal placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none"
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-slate-950 py-3 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
      >
        {pending ? "Vérification..." : "Vérifier"}
      </button>
    </form>
  );
}

export default function LoginForm() {
  const searchParams = useSearchParams();
  const callback = searchParams.get("callback") ?? "/admin";
  const [state, formAction, pending] = useActionState(login, undefined);

  if (state?.mfaRequired) {
    return <MfaStep />;
  }

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
            autoComplete="email"
            spellCheck={false}
            placeholder="jean.dupont@exemple.com"
            className="w-full rounded-lg border border-slate-300 bg-white py-3 pl-10 pr-3 text-sm placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none"
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
            autoComplete="current-password"
            className="w-full rounded-lg border border-slate-300 bg-white py-3 pl-10 pr-3 text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none"
          />
        </div>
        <div className="mt-1.5 text-right">
          <span className="cursor-not-allowed text-sm text-slate-400">
            Mot de passe oublié (bientôt)
          </span>
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
