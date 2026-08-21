"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Mail, Lock, AlertCircle, ShieldCheck } from "lucide-react";
import { login, verifyMfaLogin } from "@/lib/auth/actions";
import ResendActivationForm from "@/components/auth/ResendActivationForm";
import { fieldClass, buttonClass, noticeClass, errorClass } from "@/components/auth/form-classes";
import type { Locale } from "@/lib/i18n/config";
import type { AuthDictionary } from "@/lib/i18n/auth";



function MfaStep({ locale, t }: { locale: Locale; t: AuthDictionary["login"] }) {
  const [state, formAction, pending] = useActionState(verifyMfaLogin, undefined);

  return (
    <form action={formAction} className="mt-8 animate-fade-in-up space-y-5">
      <input type="hidden" name="locale" value={locale} />
      <div className={noticeClass}>
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-ok" />
        <p>{t.mfaNotice}</p>
      </div>

      {state?.error && (
        <div className={errorClass}>
          <AlertCircle className="h-4 w-4 shrink-0" />
          <p>{state.error}</p>
        </div>
      )}

      <div>
        <label className="mb-1.5 block text-sm font-bold text-ink">
          {t.mfaLabel}
        </label>
        <input
          type="text"
          name="code"
          required
          autoFocus
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder={t.mfaPlaceholder}
          className="w-full border border-line bg-paper px-3 py-3 text-center text-lg tracking-widest text-ink placeholder:text-sm placeholder:tracking-normal placeholder:text-ink-soft/60 focus:outline-none focus:ring-4 focus:ring-brand/35"
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className={buttonClass}
      >
        {pending ? t.mfaPending : t.mfaSubmit}
      </button>
    </form>
  );
}

export default function LoginForm({
  locale,
  t,
  resend,
}: {
  locale: Locale;
  t: AuthDictionary["login"];
  resend: AuthDictionary["resend"];
}) {
  const searchParams = useSearchParams();
  const callback = searchParams.get("callback") ?? "/admin";
  const [state, formAction, pending] = useActionState(login, undefined);
  const [email, setEmail] = useState("");

  if (state?.mfaRequired) {
    return <MfaStep locale={locale} t={t} />;
  }

  return (
    <form action={formAction} className="mt-8 animate-fade-in-up space-y-5">
      <input type="hidden" name="callback" value={callback} />
      <input type="hidden" name="locale" value={locale} />

      {state?.error && (
        <div className={errorClass}>
          <AlertCircle className="h-4 w-4 shrink-0" />
          <p>{state.error}</p>
        </div>
      )}

      {state?.needsVerification && (
        <div className="space-y-3 border border-line bg-clay px-3 py-3">
          <p className="text-sm text-ink-soft">
            {t.resendPromptStart} <span className="font-bold text-ink">{email}</span>{t.resendPromptEnd}
          </p>
          <ResendActivationForm locale={locale} t={resend} defaultEmail={email} compact />
        </div>
      )}

      <div>
        <label className="mb-1.5 block text-sm font-bold text-ink">
          {t.email}
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
            placeholder={t.emailPlaceholder}
            className={fieldClass}
          />
        </div>
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label className="block text-sm font-bold text-ink">
            {t.password}
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
            href={locale === "en" ? "/en/auth/mot-de-passe-oublie" : "/auth/mot-de-passe-oublie"}
            className="text-sm font-medium text-brand-deep underline underline-offset-4 hover:text-ink"
          >
            {t.forgot}
          </Link>
        </div>
      </div>

      <button
        type="submit"
        disabled={pending}
        className={buttonClass}
      >
        {pending ? t.pending : t.submit}
      </button>
    </form>
  );
}
