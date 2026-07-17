"use client";

import { useActionState } from "react";
import { AlertCircle, CheckCircle2, Mail } from "lucide-react";
import { requestPasswordReset } from "@/lib/auth/actions";

const fieldClass =
  "w-full border-2 border-line bg-paper py-3 pl-10 pr-3 text-sm text-ink placeholder:text-ink-soft/60 focus:outline-none focus:ring-4 focus:ring-brand/35";

const buttonClass =
  "w-full border-2 border-line bg-brand px-5 py-3 text-sm font-extrabold text-[#1C1917] transition hover:bg-ink hover:text-paper disabled:cursor-not-allowed disabled:opacity-60";

export default function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(requestPasswordReset, undefined);

  if (state?.success) {
    return (
      <div className="flex items-start gap-2 border-2 border-line-soft bg-clay px-3 py-3 text-sm text-ink-soft">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok" />
        <p>
          Si un compte est associé à cet email, un lien de réinitialisation vient d&apos;y être
          envoyé. Vérifiez votre boîte mail (et vos spams). Le lien expire dans 1&nbsp;heure.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="mt-8 animate-fade-in-up space-y-5">
      {state?.success === false && (
        <div className="flex items-center gap-2 border-2 border-err bg-err-soft px-3 py-2.5 text-sm font-semibold text-err">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <p>{state.error}</p>
        </div>
      )}

      <div>
        <label className="mb-1.5 block text-sm font-bold text-ink">Email</label>
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

      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Envoi..." : "Envoyer le lien de réinitialisation"}
      </button>
    </form>
  );
}
