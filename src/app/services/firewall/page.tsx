import type { Metadata } from "next";
import ServicePageShell from "@/components/landing/ServicePageShell";
import { getDictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";

export const metadata: Metadata = {
  title: "FireWall | SafeLinkHub",
  description: "Offre en préparation — décrivez-nous votre besoin.",
};

export async function FirewallPageContent({ locale }: { locale: Locale }) {
  const dict = await getDictionary(locale);
  const t = dict.servicePages.firewall;
  return (
    <ServicePageShell
      dict={dict}
      locale={locale}
      eyebrow={t.eyebrow}
      heading={t.heading}
      lead={t.lead}
      ctaLabel={t.cta}
      ctaHref="/contact"
    >
      {/* Pas de liste de fonctionnalités : elles n'existent pas encore.
          Annoncer des capacités inexistantes se paierait au premier client
          venu les réclamer. */}
      <p className="mt-8 border-l-2 border-brand bg-clay px-5 py-4 text-sm leading-6 text-ink">
        {t.soon}
      </p>
    </ServicePageShell>
  );
}

export default function FirewallPage() {
  return <FirewallPageContent locale="fr" />;
}
