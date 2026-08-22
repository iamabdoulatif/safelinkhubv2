import type { Metadata } from "next";
import ServicePageShell from "@/components/landing/ServicePageShell";
import { getDictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";

export const metadata: Metadata = {
  title: "Hotspot Wi-Fi | SafeLinkHub",
  description:
    "Portail captif à votre marque, tickets, encaissement mobile money et supervision, sur vos propres MikroTik.",
};

export async function HotspotPageContent({ locale }: { locale: Locale }) {
  const dict = await getDictionary(locale);
  const t = dict.servicePages.hotspot;
  return (
    <ServicePageShell
      dict={dict}
      locale={locale}
      eyebrow={t.eyebrow}
      heading={t.heading}
      lead={t.lead}
      ctaLabel={t.cta}
      ctaHref="/auth/register"
    >
      <div className="stagger mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2">
        {t.points.map((p) => (
          <article key={p.title} className="reveal slate-card bg-paper p-6">
            <h2 className="font-display text-lg font-bold text-ink">{p.title}</h2>
            <p className="mt-2 text-sm leading-6 text-ink-soft">{p.text}</p>
          </article>
        ))}
      </div>
    </ServicePageShell>
  );
}

export default function HotspotPage() {
  return <HotspotPageContent locale="fr" />;
}
