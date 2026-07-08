import Link from "next/link";
import { redirect } from "next/navigation";
import AuthShell from "@/components/auth/AuthShell";
import { getSession } from "@/lib/auth/session";
import ForgotPasswordForm from "./ForgotPasswordForm";

export default async function ForgotPasswordPage() {
  // Déjà connecté → rien à réinitialiser.
  const session = await getSession();
  if (session) redirect("/admin");

  return (
    <AuthShell
      eyebrow="Espace sécurisé"
      title={
        <>
          Récupérez votre <span className="marker">accès.</span>
        </>
      }
      description="Saisissez l'email de votre compte : nous vous enverrons un lien pour définir un nouveau mot de passe."
      footer={
        <>
          Vous vous souvenez de votre mot de passe ?{" "}
          <Link
            href="/auth/login"
            className="font-bold text-brand-deep underline decoration-2 underline-offset-4 hover:bg-brand hover:text-[#1C1917]"
          >
            Connexion
          </Link>
        </>
      }
    >
      <div>
        <p className="font-mono text-xs font-semibold uppercase tracking-widest text-ink-soft">
          Mot de passe oublié
        </p>
        <h2 className="mt-2 font-display text-3xl font-extrabold text-ink">
          Réinitialiser le mot de passe
        </h2>
        <p className="mt-2 text-sm leading-6 text-ink-soft">
          Un lien sécurisé, valable 1&nbsp;heure, sera envoyé à votre adresse email.
        </p>
        <ForgotPasswordForm />
      </div>
    </AuthShell>
  );
}
