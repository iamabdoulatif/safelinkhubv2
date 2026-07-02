import Link from "next/link";
import AuthShell from "@/components/auth/AuthShell";
import RegisterForm from "./RegisterForm";

export default function RegisterPage() {
  return (
    <AuthShell
      eyebrow="Création gratuite"
      title={
        <>
          Lancer votre portail <span className="marker">hotspot.</span>
        </>
      }
      description="Créez un compte pour gérer les ventes, routeurs MikroTik, accès directs et abonnements depuis une interface unifiée."
      wide
      footer={
        <>
          Vous avez déjà un compte ?{" "}
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
          Inscription
        </p>
        <h2 className="mt-2 font-display text-3xl font-extrabold text-ink">
          Créer un compte SafeLinkHub
        </h2>
        <p className="mt-2 text-sm leading-6 text-ink-soft">
          Le compte démarre gratuitement, sans carte bancaire.
        </p>
        <RegisterForm />
      </div>
    </AuthShell>
  );
}
