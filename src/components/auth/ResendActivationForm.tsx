"use client";

import { useActionState } from "react";
import { CheckCircle2, Mail, Send } from "lucide-react";
import { resendActivation } from "@/lib/auth/actions";

const fieldClass =
  "w-full border-2 border-line bg-paper py-3 pl-10 pr-3 text-sm text-ink placeholder:text-ink-soft/60 focus:outline-none focus:ring-4 focus:ring-brand/35";

const buttonClass =
  "w-full border-2 border-line bg-brand px-5 py-3 text-sm font-extrabold text-[#1C1917] transition hover:bg-ink hover:text-paper disabled:cursor-not-allowed disabled:opacity-60";

export default function ResendActivationForm({
  defaultEmail = "",
  compact = false,
}: {
  defaultEmail?: string;
  compact?: boolean;
}) {
  const [state, formAction, pending] = useActionState(resendActivation, undefined);

  if (state?.success) {
    return (
      <div className="flex items-start gap-2 border-2 border-line-soft bg-clay px-3 py-2.5 text-sm text-ink-soft">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok" />
        <p>Si un compte non activé correspond à cet email, un nouveau lien d&apos;activation vient d&apos;être envoyé.</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      {!compact && (
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
              defaultValue={defaultEmail}
              placeholder="jean.dupont@exemple.com"
              className={fieldClass}
            />
          </div>
        </div>
      )}
      {compact && <input type="hidden" name="email" value={defaultEmail} />}
      {state?.success === false && (
        <p className="text-sm font-semibold text-err">{state.error}</p>
      )}
      <button type="submit" disabled={pending} className={buttonClass}>
        <span className="inline-flex items-center justify-center gap-2">
          <Send className="h-4 w-4" />
          {pending ? "Envoi..." : "Renvoyer l'email d'activation"}
        </span>
      </button>
    </form>
  );
}
