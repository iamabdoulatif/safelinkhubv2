import BackToTop from "@/components/BackToTop";
import Reveal from "@/components/motion/Reveal";
import AnnounceBar from "./AnnounceBar";
import LandingNav from "./LandingNav";
import Hero from "./Hero";
import TrustStrip from "./TrustStrip";
import IntroSplit from "./IntroSplit";
import { FeatureProvisioning, FeatureMobileMoney } from "./FeatureSplits";
import ProcessSteps from "./ProcessSteps";
import ProductDemo from "./ProductDemo";
import FeaturesGrid from "./FeaturesGrid";
import PlatformDark from "./PlatformDark";
import HardwareSection from "./HardwareSection";
import Pricing from "./Pricing";
import ResellerSection from "./ResellerSection";
import SafecoinSection from "./SafecoinSection";
import Testimonials from "./Testimonials";
import BlogTeaser from "./BlogTeaser";
import FaqSection from "./FaqSection";
import FinalCta from "./FinalCta";
import LandingFooter from "./LandingFooter";
import type { Dictionary } from "@/lib/i18n/fr";
import type { Locale } from "@/lib/i18n/config";
import type { PlatformStats } from "@/lib/landing/platform-stats";

/* Composition unique de la landing, rendue par les DEUX routes (/ et /en).
 *
 * Sans elle, ajouter une section demanderait de penser à la déclarer deux fois
 * — et l'oubli ne casserait rien : la page anglaise perdrait simplement un
 * bloc, en silence. */
export default function LandingPage({
  dict,
  locale,
  stats,
}: {
  dict: Dictionary;
  locale: Locale;
  stats: PlatformStats;
}) {
  return (
    /* `lang` sur le sous-arbre : le layout racine est au-dessus des routes et
       code <html lang="fr"> en dur. C'est un attribut global, honoré par les
       lecteurs d'écran pour tout ce qu'il contient — sans quoi la page
       anglaise serait lue avec la prononciation française. Le correctif
       complet (<html lang>) suppose de déplacer les routes sous app/[lang]. */
    <div lang={locale} className="theme-slate flex flex-1 flex-col">
      <AnnounceBar dict={dict} locale={locale} />
      <LandingNav nav={dict.nav} locale={locale} />
      <main>
        <Hero dict={dict} locale={locale} stats={stats} />
        <TrustStrip dict={dict} />
        <IntroSplit dict={dict} />
        <FeatureProvisioning dict={dict} locale={locale} />
        <FeatureMobileMoney dict={dict} />
        <ProcessSteps dict={dict} />
        <ProductDemo dict={dict} locale={locale} />
        <FeaturesGrid dict={dict} />
        <PlatformDark dict={dict} />
        <HardwareSection dict={dict} />
        <Pricing dict={dict} locale={locale} />
        <ResellerSection dict={dict} locale={locale} />
        <SafecoinSection dict={dict} locale={locale} />
        <Testimonials dict={dict} locale={locale} />
        <BlogTeaser dict={dict} locale={locale} />
        <FaqSection dict={dict} />
        <FinalCta dict={dict} locale={locale} />
      </main>
      <LandingFooter dict={dict} locale={locale} />
      <BackToTop label={dict.backToTop} />
      <Reveal />
    </div>
  );
}
