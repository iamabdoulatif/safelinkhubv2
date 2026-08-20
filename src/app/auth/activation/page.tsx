import Link from "next/link";
import AuthShell from "@/components/auth/AuthShell";
import ActivateForm from "./ActivateForm";

export default async function ActivationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;

  return (
    <AuthShell
      eyebrow="Activation du compte"
      title={
        <>
          Activez votre <span className="marker">compte.</span>
        </>
      }
      description="Confirmez votre adresse email pour débloquer l'accès à votre tableau de bord SafeLinkHub."
      footer={
        <>
          Besoin d&apos;aide ?{" "}
          <Link
            href="/contact"
            className="font-bold text-brand-deep underline underline-offset-4 hover:text-ink"
          >
            Contactez-nous
          </Link>
        </>
      }
    >
      <div>
        <p className="font-mono text-xs font-semibold uppercase tracking-widest text-ink-soft">
          Dernière étape
        </p>
        <h2 className="mt-2 font-display text-3xl font-bold text-ink">
          Confirmer mon email
        </h2>
        <div className="mt-6">
          <ActivateForm token={token ?? ""} error={error === "invalid"} />
        </div>
      </div>
    </AuthShell>
  );
}
