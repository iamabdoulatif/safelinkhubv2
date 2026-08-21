"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, Eye, EyeOff, Lock } from "lucide-react";
import { resetPassword } from "@/lib/auth/actions";
import PasswordStrengthMeter from "@/components/PasswordStrengthMeter";
import { fieldClassWithToggle, labelClass, buttonClass, noticeClass, errorClass } from "@/components/auth/form-classes";
import type { Locale } from "@/lib/i18n/config";
import type { AuthDictionary } from "@/lib/i18n/auth";




export default function ResetPasswordForm({
  locale,
  t,
  token,
}: {
  locale: Locale;
  t: AuthDictionary["reset"];
  token: string;
}) {
  const [state, formAction, pending] = useActionState(resetPassword, undefined);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  if (state?.success) {
    return (
      <div className="space-y-5">
        <div className={noticeClass}>
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok" />
          <p>{t.success}</p>
        </div>
        <Link href={locale === "en" ? "/en/auth/login" : "/auth/login"} className={`${buttonClass} block text-center`}>
          {t.goLogin}
        </Link>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="space-y-4">
        <div className={errorClass}>
          <AlertCircle className="h-4 w-4 shrink-0" />
          <p>{t.invalid}</p>
        </div>
        <Link
          href={locale === "en" ? "/en/auth/mot-de-passe-oublie" : "/auth/mot-de-passe-oublie"}
          className="block text-center text-sm font-bold text-brand-deep underline underline-offset-4 hover:text-ink"
        >
          {t.retry}
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="mt-8 animate-fade-in-up space-y-5">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="locale" value={locale} />

      {state?.success === false && (
        <div className={errorClass}>
          <AlertCircle className="h-4 w-4 shrink-0" />
          <p>{state.error}</p>
        </div>
      )}

      <div>
        <label className={labelClass}>{t.password}</label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
          <input
            type={showPassword ? "text" : "password"}
            name="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={fieldClassWithToggle}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? t.hidePassword : t.showPassword}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-soft hover:text-ink"
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <PasswordStrengthMeter password={password} />
      </div>

      <div>
        <label className={labelClass}>{t.confirmPassword}</label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
          <input
            type={showConfirm ? "text" : "password"}
            name="confirmPassword"
            required
            minLength={8}
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className={fieldClassWithToggle}
          />
          <button
            type="button"
            onClick={() => setShowConfirm((v) => !v)}
            aria-label={showConfirm ? t.hidePassword : t.showPassword}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-soft hover:text-ink"
          >
            {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {confirmPassword && (
          <p
            className={`mt-1.5 text-xs font-medium ${
              confirmPassword === password ? "text-ok" : "text-err"
            }`}
          >
            {confirmPassword === password
              ? t.passwordsMatch
              : t.passwordsMismatch}
          </p>
        )}
      </div>

      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? t.pending : t.submit}
      </button>
    </form>
  );
}
