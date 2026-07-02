import Link from "next/link";
import { Suspense } from "react";
import AuthShell from "@/components/auth/AuthShell";
import LoginForm from "./LoginForm";

export default function LoginPage() {
  return (
    <AuthShell
      eyebrow="Espace sécurisé"
      title={
        <>
          Reprendre le contrôle de votre <span className="marker">réseau.</span>
        </>
      }
      description="Connectez-vous au tableau de bord qui pilote vos routeurs, ventes, accès VPN et opérations terrain."
      footer={
        <>
          Vous n&apos;avez pas de compte ?{" "}
          <Link
            href="/auth/register"
            className="font-bold text-brand-deep underline decoration-2 underline-offset-4 hover:bg-brand hover:text-[#1C1917]"
          >
            Inscrivez-vous
          </Link>
        </>
      }
    >
      <div>
        <p className="font-mono text-xs font-semibold uppercase tracking-widest text-ink-soft">
          Connexion
        </p>
        <h2 className="mt-2 font-display text-3xl font-extrabold text-ink">
          Accès au dashboard
        </h2>
        <p className="mt-2 text-sm leading-6 text-ink-soft">
          Vos sessions restent protégées avec vérification MFA si elle est activée.
        </p>
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </AuthShell>
  );
}
