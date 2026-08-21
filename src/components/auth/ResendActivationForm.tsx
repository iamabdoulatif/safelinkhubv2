"use client";

import { useActionState } from "react";
import { CheckCircle2, Mail, Send } from "lucide-react";
import { resendActivation } from "@/lib/auth/actions";
import { fieldClass, buttonClass, noticeClass } from "@/components/auth/form-classes";
import type { Locale } from "@/lib/i18n/config";
import type { AuthDictionary } from "@/lib/i18n/auth";



export default function ResendActivationForm({
  locale = "fr",
  t,
  defaultEmail = "",
  compact = false,
}: {
  locale?: Locale;
  t: AuthDictionary["resend"];
  defaultEmail?: string;
  compact?: boolean;
}) {
  const [state, formAction, pending] = useActionState(resendActivation, undefined);

  if (state?.success) {
    return (
      <div className={noticeClass}>
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok" />
        <p>{t.success}</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="locale" value={locale} />
      {!compact && (
        <div>
          <label className="mb-1.5 block text-sm font-bold text-ink">{t.email}</label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              spellCheck={false}
              defaultValue={defaultEmail}
              placeholder={t.placeholder}
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
          {pending ? t.pending : t.submit}
        </span>
      </button>
    </form>
  );
}
