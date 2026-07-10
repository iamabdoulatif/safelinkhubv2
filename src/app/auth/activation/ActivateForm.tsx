import Link from "next/link";
import { AlertCircle, ShieldCheck } from "lucide-react";
import ResendActivationForm from "@/components/auth/ResendActivationForm";

const buttonClass =
  "w-full border-2 border-line bg-brand px-5 py-3 text-sm font-extrabold text-[#1C1917] transition hover:bg-ink hover:text-paper";

/**
 * Formulaire d'activation = POST HTML pur vers la Route Handler stable
 * /api/auth/activate (pas de Server Action lié au build → robuste aux
 * redéploiements et fonctionne même sans JS). `error` vient du query param
 * posé par la Route Handler en cas de token invalide/expiré.
 */
export default function ActivateForm({
  token,
  error,
}: {
  token: string;
  error?: boolean;
}) {
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
    <form action="/api/auth/activate" method="post" className="space-y-5">
      <input type="hidden" name="token" value={token} />
      <div className="flex items-start gap-2 border-2 border-line-soft bg-clay px-3 py-2.5 text-sm text-ink-soft">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-ok" />
        <p>Cliquez ci-dessous pour confirmer votre adresse et activer votre compte.</p>
      </div>
      <button type="submit" className={buttonClass}>
        Activer mon compte
      </button>
    </form>
  );
}
