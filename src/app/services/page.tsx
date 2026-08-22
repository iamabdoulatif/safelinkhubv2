import type { Metadata } from "next";
import LandingNav from "@/components/landing/LandingNav";
import LandingFooter from "@/components/landing/LandingFooter";
import FeaturesGrid from "@/components/landing/FeaturesGrid";
import PlatformDark from "@/components/landing/PlatformDark";
import HardwareSection from "@/components/landing/HardwareSection";
import FinalCta from "@/components/landing/FinalCta";
import Reveal from "@/components/motion/Reveal";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { localePrefix, type Locale } from "@/lib/i18n/config";

/* Page « Services ».
 *
 * Les trois sections qu'elle porte — fonctionnalités, plateforme, matériel —
 * ont été DÉPLACÉES depuis la landing, pas recopiées : deux pages servant le
 * même contenu se concurrenceraient au référencement, et la landing restait
 * interminable. Elle garde ce qui convertit (accroche, preuve, tarifs, FAQ) ;
 * la profondeur vit ici. */
export const metadata: Metadata = {
  title: "Services | SafeLinkHub",
  description:
    "Provisionnement MikroTik, portail captif, mobile money, supervision : le détail des services SafeLinkHub.",
};

export async function ServicesPageContent({ locale }: { locale: Locale }) {
  const dict = await getDictionary(locale);
  const t = dict.servicesPage;

  return (
    <div lang={locale} className="theme-slate flex flex-1 flex-col">
      <LandingNav anchorPrefix={localePrefix(locale) || "/"} nav={dict.nav} locale={locale} />
      <main className="flex-1 bg-paper">
        <section className="mx-auto max-w-6xl px-4 pb-6 pt-14 sm:px-6">
          <span className="slate-eyebrow">{t.eyebrow}</span>
          <h1 className="mt-5 max-w-3xl font-display text-4xl font-bold leading-tight tracking-tight text-ink sm:text-5xl">
            {t.heading}
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-ink-soft">{t.lead}</p>
        </section>

        <FeaturesGrid dict={dict} />
        <PlatformDark dict={dict} />
        <HardwareSection dict={dict} />
        <FinalCta dict={dict} locale={locale} />
      </main>
      <LandingFooter dict={dict} locale={locale} />
      <Reveal />
    </div>
  );
}

export default function ServicesPage() {
  return <ServicesPageContent locale="fr" />;
}
