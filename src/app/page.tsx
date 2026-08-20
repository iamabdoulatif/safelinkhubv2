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
import ResellerSection from "@/components/landing/ResellerSection";
import SafecoinSection from "@/components/landing/SafecoinSection";
import Testimonials from "@/components/landing/Testimonials";
import BlogTeaser from "@/components/landing/BlogTeaser";
import FaqSection from "@/components/landing/FaqSection";
import FinalCta from "@/components/landing/FinalCta";
import LandingFooter from "@/components/landing/LandingFooter";
import { getPlatformStats } from "@/lib/landing/platform-stats";

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
export default async function Home() {
  // Chiffres réels, recalculés à chaque revalidation ISR (5 min). Aucun
  // montant : voir lib/landing/platform-stats.ts pour la raison.
  const stats = await getPlatformStats();

  return (
    <div className="theme-slate flex flex-1 flex-col">
      <AnnounceBar />
      <LandingNav />
      <main>
        <Hero stats={stats} />
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
        <ResellerSection />
        <SafecoinSection />
        <Testimonials />
        <BlogTeaser />
        <FaqSection />
        <FinalCta />
      </main>
      <LandingFooter />
      <BackToTop />
    </div>
  );
}
