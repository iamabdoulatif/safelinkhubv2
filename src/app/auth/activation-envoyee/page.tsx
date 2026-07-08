import Link from "next/link";
import { MailCheck } from "lucide-react";
import AuthShell from "@/components/auth/AuthShell";
import ResendActivationForm from "@/components/auth/ResendActivationForm";

export default async function ActivationSentPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;

  return (
    <AuthShell
      eyebrow="Vérification email"
      title={
        <>
          Confirmez votre <span className="marker">adresse.</span>
        </>
      }
      description="Une dernière étape : validez votre email pour activer votre compte et accéder au tableau de bord."
      footer={
        <>
          Déjà activé ?{" "}
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
        <div className="mb-4 flex h-12 w-12 items-center justify-center border-2 border-line bg-brand text-[#1C1917]">
          <MailCheck className="h-6 w-6" />
        </div>
        <p className="font-mono text-xs font-semibold uppercase tracking-widest text-ink-soft">
          Email envoyé
        </p>
        <h2 className="mt-2 font-display text-3xl font-extrabold text-ink">
          Vérifiez votre boîte mail
        </h2>
        <p className="mt-3 text-sm leading-6 text-ink-soft">
          Nous avons envoyé un lien d&apos;activation
          {email ? (
            <>
              {" "}à <span className="font-bold text-ink">{email}</span>
            </>
          ) : null}
          . Cliquez dessus pour activer votre compte. Le lien expire dans 24&nbsp;heures.
        </p>
        <p className="mt-3 text-sm leading-6 text-ink-soft">
          Rien reçu ? Vérifiez vos spams, ou renvoyez le lien&nbsp;:
        </p>
        <div className="mt-4">
          <ResendActivationForm defaultEmail={email ?? ""} />
        </div>
      </div>
    </AuthShell>
  );
}
