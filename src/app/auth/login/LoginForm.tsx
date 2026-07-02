"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { Mail, Lock, AlertCircle, ShieldCheck } from "lucide-react";
import { login, verifyMfaLogin } from "@/lib/auth/actions";

const fieldClass =
  "w-full border-2 border-line bg-paper py-3 pl-10 pr-3 text-sm text-ink placeholder:text-ink-soft/60 focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand/35";

const primaryButtonClass =
  "w-full border-2 border-line bg-brand px-5 py-3 text-sm font-extrabold text-[#1C1917] transition hover:bg-ink hover:text-paper disabled:cursor-not-allowed disabled:opacity-60";

function MfaStep() {
  const [state, formAction, pending] = useActionState(verifyMfaLogin, undefined);

  return (
    <form action={formAction} className="mt-8 animate-fade-in-up space-y-5">
      <div className="flex items-start gap-2 border-2 border-line-soft bg-clay px-3 py-2.5 text-sm text-ink-soft">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-ok" />
        <p>Entrez le code à 6 chiffres de votre application d&apos;authentification.</p>
      </div>

      {state?.error && (
        <div className="flex items-center gap-2 border-2 border-err bg-[#FFF3ED] px-3 py-2.5 text-sm font-semibold text-err">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <p>{state.error}</p>
        </div>
      )}

      <div>
        <label className="mb-1.5 block text-sm font-bold text-ink">
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
          className="w-full border-2 border-line bg-paper px-3 py-3 text-center text-lg tracking-widest text-ink placeholder:text-sm placeholder:tracking-normal placeholder:text-ink-soft/60 focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand/35"
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className={primaryButtonClass}
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
        <div className="flex items-center gap-2 border-2 border-err bg-[#FFF3ED] px-3 py-2.5 text-sm font-semibold text-err">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <p>{state.error}</p>
        </div>
      )}

      <div>
        <label className="mb-1.5 block text-sm font-bold text-ink">
          Email
        </label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            spellCheck={false}
            placeholder="jean.dupont@exemple.com"
            className={fieldClass}
          />
        </div>
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label className="block text-sm font-bold text-ink">
            Mot de passe
          </label>
        </div>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
          <input
            type="password"
            name="password"
            required
            autoComplete="current-password"
            className={fieldClass}
          />
        </div>
        <div className="mt-1.5 text-right">
          <span className="cursor-not-allowed text-sm font-medium text-ink-soft/70">
            Mot de passe oublié (bientôt)
          </span>
        </div>
      </div>

      <button
        type="submit"
        disabled={pending}
        className={primaryButtonClass}
      >
        {pending ? "Connexion en cours..." : "Connexion"}
      </button>
    </form>
  );
}
