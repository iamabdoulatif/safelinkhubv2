"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, Loader2, ShieldCheck } from "lucide-react";
import ResendActivationForm from "@/components/auth/ResendActivationForm";
import { buttonClass, noticeClass, errorClass } from "@/components/auth/form-classes";
import type { Locale } from "@/lib/i18n/config";
import type { AuthDictionary } from "@/lib/i18n/auth";


/**
 * Formulaire d'activation = POST HTML pur vers la Route Handler stable
 * /api/auth/activate (pas de Server Action lié au build → robuste aux
 * redéploiements et fonctionne même sans JS). `error` vient du query param
 * posé par la Route Handler en cas de token invalide/expiré.
 *
 * Auto-confirmation : dès que la page (ouverte depuis le bouton de l'email) est
 * chargée dans un vrai navigateur, on soumet le POST automatiquement — plus de
 * 2ᵉ bouton « Activer mon compte » à cliquer côté site. Le bouton reste rendu
 * comme repli sans JS ; les scanners de liens email préchargent en GET sans
 * exécuter de JS, donc ils ne déclenchent pas cette soumission et ne consomment
 * jamais le token (cf. le commentaire de la Route Handler). Le rendu initial
 * (bouton actif) est identique serveur/client pour éviter tout mismatch
 * d'hydratation ; l'effet passe ensuite en état « en cours ».
 */
export default function ActivateForm({
  locale,
  t,
  resend,
  token,
  error,
}: {
  locale: Locale;
  t: AuthDictionary["activation"];
  resend: AuthDictionary["resend"];
  token: string;
  error?: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token || error) return;
    const form = formRef.current;
    if (!form) return;
    // requestSubmit() déclenche l'événement `submit` (→ onSubmit bascule l'UI en
    // « en cours ») puis la soumission native ; .submit() est le repli pour les
    // très vieux navigateurs, sans passer par onSubmit.
    if (typeof form.requestSubmit === "function") form.requestSubmit();
    else form.submit();
  }, [token, error]);

  if (!token || error) {
    return (
      <div className="space-y-4">
        <div className={errorClass}>
          <AlertCircle className="h-4 w-4 shrink-0" />
          <p>
            {token
              ? t.invalidExpired
              : t.invalid}
          </p>
        </div>
        <p className="text-sm text-ink-soft">{t.resendPrompt}</p>
        <ResendActivationForm locale={locale} t={resend} />
        <p className="text-center text-sm text-ink-soft">
          <Link
            href={locale === "en" ? "/en/auth/login" : "/auth/login"}
            className="font-bold text-brand-deep underline underline-offset-4 hover:text-ink"
          >
            {t.backLogin}
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form
      ref={formRef}
      action="/api/auth/activate"
      method="post"
      onSubmit={() => setSubmitting(true)}
      className="space-y-5"
    >
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="locale" value={locale} />
      <div className={noticeClass}>
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-ok" />
        <p>
          {submitting
            ? t.pending
            : t.ready}
        </p>
      </div>
      <button type="submit" disabled={submitting} className={buttonClass}>
        {submitting ? (
          <span className="inline-flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t.pendingButton}
          </span>
        ) : (
          t.submit
        )}
      </button>
    </form>
  );
}
