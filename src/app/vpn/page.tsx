import type { Metadata } from "next";
import LandingNav from "@/components/landing/LandingNav";
import LandingFooter from "@/components/landing/LandingFooter";
import Pricing from "@/components/landing/Pricing";
import FinalCta from "@/components/landing/FinalCta";
import Reveal from "@/components/motion/Reveal";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { localePrefix, type Locale } from "@/lib/i18n/config";

/* Page « VPN / accès distant ».
 *
 * La grille tarifaire vient de la landing. Elle porte les VRAIS prix, lus dans
 * la configuration de facturation — c'est pour cela qu'elle est déplacée et
 * non recopiée : deux grilles finiraient par diverger le jour où l'une est
 * modifiée sans l'autre. */
export const metadata: Metadata = {
  title: "VPN et accès distant | SafeLinkHub",
  description:
    "Tunnel chiffré vers vos MikroTik : WinBox, WebFig, SSH et MikHmon, même derrière un CGNAT. Tarifs réels.",
};

export async function VpnPageContent({ locale }: { locale: Locale }) {
  const dict = await getDictionary(locale);
  const t = dict.vpnPage;

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

        <Pricing dict={dict} locale={locale} />
        <FinalCta dict={dict} locale={locale} />
      </main>
      <LandingFooter dict={dict} locale={locale} />
      <Reveal />
    </div>
  );
}

export default function VpnPage() {
  return <VpnPageContent locale="fr" />;
}
