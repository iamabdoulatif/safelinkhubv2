import Link from "next/link";
import { redirect } from "next/navigation";
import AuthShell from "@/components/auth/AuthShell";
import { getSession } from "@/lib/auth/session";
import { findOrgByReferralCode } from "@/lib/referrals/service";
import { normalizeReferralCode } from "@/lib/referrals/rewards";
import RegisterForm from "./RegisterForm";
import { getAuthDictionary } from "@/lib/i18n/auth";
import { localeHref, type Locale } from "@/lib/i18n/config";

export async function RegisterPageContent({
  locale,
  searchParams,
}: {
  locale: Locale;
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

  const t = getAuthDictionary(locale).register;
  return (
    <AuthShell
      locale={locale}
      eyebrow={t.eyebrow}
      title={
        <>
          {t.titleStart}<span className="marker">{t.titleMark}</span>
        </>
      }
      description={t.description}
      wide
      footer={
        <>
          {t.footerStart}{" "}
          <Link
            href={localeHref("/auth/login", locale)}
            className="font-bold text-brand-deep underline underline-offset-4 hover:text-ink"
          >
            {t.footerLink}
          </Link>
        </>
      }
    >
      <div>
        <p className="font-mono text-xs font-semibold uppercase tracking-widest text-ink-soft">
          {t.section}
        </p>
        <h2 className="mt-2 font-display text-3xl font-bold text-ink">
          {t.heading}
        </h2>
        <p className="mt-2 text-sm leading-6 text-ink-soft">
          {t.lead}
        </p>
        <RegisterForm locale={locale} t={t} referralCode={referralCode} referrerName={referrer?.name ?? null} />
      </div>
    </AuthShell>
  );
}

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  return <RegisterPageContent locale="fr" searchParams={searchParams} />;
}
