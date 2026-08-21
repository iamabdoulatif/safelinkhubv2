import Link from "next/link";
import AuthShell from "@/components/auth/AuthShell";
import ResetPasswordForm from "./ResetPasswordForm";
import { getAuthDictionary } from "@/lib/i18n/auth";
import { localeHref, type Locale } from "@/lib/i18n/config";

export async function ResetPasswordPageContent({
  locale,
  searchParams,
}: {
  locale: Locale;
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  const t = getAuthDictionary(locale).reset;
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
        <ResetPasswordForm locale={locale} t={t} token={token ?? ""} />
      </div>
    </AuthShell>
  );
}

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  return <ResetPasswordPageContent locale="fr" searchParams={searchParams} />;
}
