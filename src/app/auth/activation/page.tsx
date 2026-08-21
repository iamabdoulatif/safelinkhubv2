import Link from "next/link";
import AuthShell from "@/components/auth/AuthShell";
import ActivateForm from "./ActivateForm";
import { getAuthDictionary } from "@/lib/i18n/auth";
import { localeHref, type Locale } from "@/lib/i18n/config";

export async function ActivationPageContent({
  locale,
  searchParams,
}: {
  locale: Locale;
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;

  const auth = getAuthDictionary(locale);
  const t = auth.activation;
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
            href={localeHref("/contact", locale)}
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
        <div className="mt-6">
          <ActivateForm locale={locale} t={t} resend={auth.resend} token={token ?? ""} error={error === "invalid"} />
        </div>
      </div>
    </AuthShell>
  );
}

export default async function ActivationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  return <ActivationPageContent locale="fr" searchParams={searchParams} />;
}
