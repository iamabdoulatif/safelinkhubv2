import Link from "next/link";
import AuthShell from "@/components/auth/AuthShell";
import ResetPasswordForm from "./ResetPasswordForm";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <AuthShell
      eyebrow="Espace sécurisé"
      title={
        <>
          Choisissez un nouveau <span className="marker">mot de passe.</span>
        </>
      }
      description="Définissez un mot de passe fort pour sécuriser votre compte SafeLinkHub."
      footer={
        <>
          Retour à la{" "}
          <Link
            href="/auth/login"
            className="font-bold text-brand-deep underline underline-offset-4 hover:text-ink"
          >
            connexion
          </Link>
        </>
      }
    >
      <div>
        <p className="font-mono text-xs font-semibold uppercase tracking-widest text-ink-soft">
          Réinitialisation
        </p>
        <h2 className="mt-2 font-display text-3xl font-bold text-ink">
          Nouveau mot de passe
        </h2>
        <p className="mt-2 text-sm leading-6 text-ink-soft">
          Au moins 8 caractères. Choisissez-en un que vous n&apos;utilisez pas ailleurs.
        </p>
        <ResetPasswordForm token={token ?? ""} />
      </div>
    </AuthShell>
  );
}
