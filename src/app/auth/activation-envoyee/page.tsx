import Link from "next/link";
import { MailCheck } from "lucide-react";
import AuthShell from "@/components/auth/AuthShell";
import ResendActivationForm from "@/components/auth/ResendActivationForm";
import { getAuthDictionary } from "@/lib/i18n/auth";
import { localeHref, type Locale } from "@/lib/i18n/config";

export async function ActivationSentPageContent({
  locale,
  searchParams,
}: {
  locale: Locale;
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;

  const t = getAuthDictionary(locale);
  return (
    <AuthShell
      locale={locale}
      eyebrow={t.activationSent.eyebrow}
      title={
        <>
          {t.activationSent.titleStart}<span className="marker">{t.activationSent.titleMark}</span>
        </>
      }
      description={t.activationSent.description}
      footer={
        <>
          {t.activationSent.footerStart}{" "}
          <Link
            href={localeHref("/auth/login", locale)}
            className="font-bold text-brand-deep underline underline-offset-4 hover:text-ink"
          >
            {t.activationSent.footerLink}
          </Link>
        </>
      }
    >
      <div>
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-brand text-slate-deep">
          <MailCheck className="h-6 w-6" />
        </div>
        <p className="font-mono text-xs font-semibold uppercase tracking-widest text-ink-soft">
          {t.activationSent.section}
        </p>
        <h2 className="mt-2 font-display text-3xl font-bold text-ink">
          {t.activationSent.heading}
        </h2>
        <p className="mt-3 text-sm leading-6 text-ink-soft">
          {t.activationSent.sentStart}
          {email ? (
            <>
              {" "}{t.activationSent.sentTo} <span className="font-bold text-ink">{email}</span>
            </>
          ) : null}
          {t.activationSent.sentEnd}
        </p>
        <p className="mt-3 text-sm leading-6 text-ink-soft">
          {t.activationSent.missing}
        </p>
        <div className="mt-4">
          <ResendActivationForm locale={locale} t={t.resend} defaultEmail={email ?? ""} />
        </div>
      </div>
    </AuthShell>
  );
}

export default async function ActivationSentPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  return <ActivationSentPageContent locale="fr" searchParams={searchParams} />;
}
