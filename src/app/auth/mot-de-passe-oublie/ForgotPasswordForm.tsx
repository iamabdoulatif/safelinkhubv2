"use client";

import { useActionState } from "react";
import { AlertCircle, CheckCircle2, Mail } from "lucide-react";
import { requestPasswordReset } from "@/lib/auth/actions";
import { fieldClass, buttonClass, noticeClass, errorClass } from "@/components/auth/form-classes";



export default function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(requestPasswordReset, undefined);

  if (state?.success) {
    return (
      <div className={noticeClass}>
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
        <div className={errorClass}>
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
