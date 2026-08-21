import Link from "next/link";
import { redirect } from "next/navigation";
import AuthShell from "@/components/auth/AuthShell";
import { getSession } from "@/lib/auth/session";
import ForgotPasswordForm from "./ForgotPasswordForm";
import { getAuthDictionary } from "@/lib/i18n/auth";
import { localeHref, type Locale } from "@/lib/i18n/config";

export async function ForgotPasswordPageContent({ locale }: { locale: Locale }) {
  // Déjà connecté → rien à réinitialiser.
  const session = await getSession();
  if (session) redirect("/admin");

  const t = getAuthDictionary(locale).forgot;
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
        <ForgotPasswordForm locale={locale} t={t} />
      </div>
    </AuthShell>
  );
}

export default async function ForgotPasswordPage() {
  return <ForgotPasswordPageContent locale="fr" />;
}
