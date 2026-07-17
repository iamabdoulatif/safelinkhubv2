import BackToTop from "@/components/BackToTop";
import SplashLoader from "@/components/SplashLoader";
import LandingNav from "@/components/landing/LandingNav";
import Hero from "@/components/landing/Hero";
import ScrollProcess from "@/components/landing/ScrollProcessLazy";
import FeaturesGrid from "@/components/landing/FeaturesGrid";
import ProductDemo from "@/components/landing/ProductDemo";
import PlatformDark from "@/components/landing/PlatformDark";
import HardwareSection from "@/components/landing/HardwareSection";
import Pricing from "@/components/landing/Pricing";
import Testimonials from "@/components/landing/Testimonials";
import FaqSection from "@/components/landing/FaqSection";
import FinalCta from "@/components/landing/FinalCta";
import LandingFooter from "@/components/landing/LandingFooter";

// ISR : la landing est majoritairement statique, mais les témoignages
// approuvés viennent de la base. On revalide périodiquement (et à chaud via
// revalidatePath("/") lors de la modération / soumission).
export const revalidate = 300;

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <LandingNav />
      <main>
        <Hero />
        <ScrollProcess />
        <FeaturesGrid />
        <ProductDemo />
        <PlatformDark />
        <HardwareSection />
        <Pricing />
        <Testimonials />
        <FaqSection />
        <FinalCta />
      </main>
      <LandingFooter />
      <BackToTop />
      <SplashLoader />
    </div>
  );
}
