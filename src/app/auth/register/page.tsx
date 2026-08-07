import Link from "next/link";
import { redirect } from "next/navigation";
import AuthShell from "@/components/auth/AuthShell";
import { getSession } from "@/lib/auth/session";
import { findOrgByReferralCode } from "@/lib/referrals/service";
import { normalizeReferralCode } from "@/lib/referrals/rewards";
import RegisterForm from "./RegisterForm";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  // Un utilisateur déjà connecté n'a rien à faire sur l'inscription.
  const session = await getSession();
  if (session) redirect("/admin");

  // Lien de parrainage /auth/register?ref=CODE : on résout le code CÔTÉ SERVEUR
  // pour afficher le nom du parrain (le filleul voit qui l'a invité, et un code
  // erroné se repère avant de remplir le formulaire). Le rattachement réel se
  // refait à l'inscription — cet affichage n'est qu'informatif.
  const { ref } = await searchParams;
  const referralCode = ref ? normalizeReferralCode(ref) : "";
  const referrer = referralCode ? await findOrgByReferralCode(referralCode) : null;

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
        <RegisterForm referralCode={referralCode} referrerName={referrer?.name ?? null} />
      </div>
    </AuthShell>
  );
}
