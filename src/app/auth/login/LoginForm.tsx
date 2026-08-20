"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Mail, Lock, AlertCircle, ShieldCheck } from "lucide-react";
import { login, verifyMfaLogin } from "@/lib/auth/actions";
import ResendActivationForm from "@/components/auth/ResendActivationForm";
import { fieldClass, buttonClass, noticeClass, errorClass } from "@/components/auth/form-classes";



function MfaStep() {
  const [state, formAction, pending] = useActionState(verifyMfaLogin, undefined);

  return (
    <form action={formAction} className="mt-8 animate-fade-in-up space-y-5">
      <div className={noticeClass}>
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-ok" />
        <p>Entrez le code à 6 chiffres de votre application d&apos;authentification.</p>
      </div>

      {state?.error && (
        <div className={errorClass}>
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
          className="w-full border border-line bg-paper px-3 py-3 text-center text-lg tracking-widest text-ink placeholder:text-sm placeholder:tracking-normal placeholder:text-ink-soft/60 focus:outline-none focus:ring-4 focus:ring-brand/35"
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className={buttonClass}
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
  const [email, setEmail] = useState("");

  if (state?.mfaRequired) {
    return <MfaStep />;
  }

  return (
    <form action={formAction} className="mt-8 animate-fade-in-up space-y-5">
      <input type="hidden" name="callback" value={callback} />

      {state?.error && (
        <div className={errorClass}>
          <AlertCircle className="h-4 w-4 shrink-0" />
          <p>{state.error}</p>
        </div>
      )}

      {state?.needsVerification && (
        <div className="space-y-3 border border-line bg-clay px-3 py-3">
          <p className="text-sm text-ink-soft">
            Renvoyer le lien d&apos;activation à <span className="font-bold text-ink">{email}</span> ?
          </p>
          <ResendActivationForm defaultEmail={email} compact />
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
            value={email}
            onChange={(e) => setEmail(e.target.value)}
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
          <Link
            href="/auth/mot-de-passe-oublie"
            className="text-sm font-medium text-brand-deep underline underline-offset-4 hover:text-ink"
          >
            Mot de passe oublié ?
          </Link>
        </div>
      </div>

      <button
        type="submit"
        disabled={pending}
        className={buttonClass}
      >
        {pending ? "Connexion en cours..." : "Connexion"}
      </button>
    </form>
  );
}
