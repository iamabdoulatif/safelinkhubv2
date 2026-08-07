"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, Loader2, ShieldCheck } from "lucide-react";
import ResendActivationForm from "@/components/auth/ResendActivationForm";

const buttonClass =
  "w-full border-2 border-line bg-brand px-5 py-3 text-sm font-extrabold text-[#1C1917] transition hover:bg-ink hover:text-paper disabled:cursor-default disabled:opacity-70 disabled:hover:bg-brand disabled:hover:text-[#1C1917]";

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
  token,
  error,
}: {
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
        <div className="flex items-center gap-2 border-2 border-err bg-err-soft px-3 py-2.5 text-sm font-semibold text-err">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <p>
            {token
              ? "Ce lien d'activation est invalide ou expiré."
              : "Lien d'activation invalide."}
          </p>
        </div>
        <p className="text-sm text-ink-soft">Renvoyez-vous un lien d&apos;activation&nbsp;:</p>
        <ResendActivationForm />
        <p className="text-center text-sm text-ink-soft">
          <Link
            href="/auth/login"
            className="font-bold text-brand-deep underline decoration-2 underline-offset-4 hover:bg-brand hover:text-[#1C1917]"
          >
            Retour à la connexion
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
      <div className="flex items-start gap-2 border-2 border-line-soft bg-clay px-3 py-2.5 text-sm text-ink-soft">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-ok" />
        <p>
          {submitting
            ? "Activation de votre compte en cours, merci de patienter…"
            : "Cliquez ci-dessous pour confirmer votre adresse et activer votre compte."}
        </p>
      </div>
      <button type="submit" disabled={submitting} className={buttonClass}>
        {submitting ? (
          <span className="inline-flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Activation en cours…
          </span>
        ) : (
          "Activer mon compte"
        )}
      </button>
    </form>
  );
}
