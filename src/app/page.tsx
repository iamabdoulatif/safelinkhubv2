import BackToTop from "@/components/BackToTop";
import AnnounceBar from "@/components/landing/AnnounceBar";
import LandingNav from "@/components/landing/LandingNav";
import Hero from "@/components/landing/Hero";
import TrustStrip from "@/components/landing/TrustStrip";
import IntroSplit from "@/components/landing/IntroSplit";
import { FeatureProvisioning, FeatureMobileMoney } from "@/components/landing/FeatureSplits";
import ProcessSteps from "@/components/landing/ProcessSteps";
import ProductDemo from "@/components/landing/ProductDemo";
import FeaturesGrid from "@/components/landing/FeaturesGrid";
import PlatformDark from "@/components/landing/PlatformDark";
import HardwareSection from "@/components/landing/HardwareSection";
import Pricing from "@/components/landing/Pricing";
import SafecoinSection from "@/components/landing/SafecoinSection";
import Testimonials from "@/components/landing/Testimonials";
import BlogTeaser from "@/components/landing/BlogTeaser";
import FaqSection from "@/components/landing/FaqSection";
import FinalCta from "@/components/landing/FinalCta";
import LandingFooter from "@/components/landing/LandingFooter";

// ISR : la landing est majoritairement statique, mais les témoignages
// approuvés et les derniers articles viennent de la base. On revalide
// périodiquement (et à chaud via revalidatePath("/") lors de la modération).
export const revalidate = 300;

/* Landing refondue sur la trame Slate, section par section : bandeau
 * d'annonce, hero centré à capture e-mail, bande de réassurance, split
 * éditorial, deux blocs alternés, preuve produit, grille de fonctionnalités,
 * bande sombre, intégrations, tarifs, témoignages, blog, FAQ, appel final,
 * pied de page à capture.
 *
 * PEAU : la classe `theme-slate` du wrapper redéfinit les jetons de couleur
 * pour CE sous-arbre uniquement (voir globals.css). /admin, /blog, /contact et
 * le portail captif gardent la charte Bitume moutarde/anthracite.
 *
 * ANIMATIONS : toutes retirées — scène isométrique du hero (7 boucles CSS),
 * section 3D pilotée au scroll (three.js + GSAP, ~180 ko) et écran de
 * démarrage. Les accordéons sont des <details> natifs, sans JavaScript. */
export default function Home() {
  return (
    <div className="theme-slate flex flex-1 flex-col">
      <AnnounceBar />
      <LandingNav variant="slate" />
      <main>
        <Hero />
        <TrustStrip />
        <IntroSplit />
        <FeatureProvisioning />
        <FeatureMobileMoney />
        <ProcessSteps />
        <ProductDemo />
        <FeaturesGrid />
        <PlatformDark />
        <HardwareSection />
        <Pricing />
        <SafecoinSection />
        <Testimonials />
        <BlogTeaser />
        <FaqSection />
        <FinalCta />
      </main>
      <LandingFooter variant="slate" />
      <BackToTop />
    </div>
  );
}
