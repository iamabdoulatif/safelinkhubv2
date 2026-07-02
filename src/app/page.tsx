import BackToTop from "@/components/BackToTop";
import SplashLoader from "@/components/SplashLoader";
import LandingNav from "@/components/landing/LandingNav";
import Hero from "@/components/landing/Hero";
import FeaturesGrid from "@/components/landing/FeaturesGrid";
import ProductDemo from "@/components/landing/ProductDemo";
import PlatformDark from "@/components/landing/PlatformDark";
import HardwareSection from "@/components/landing/HardwareSection";
import Testimonials from "@/components/landing/Testimonials";
import FaqSection from "@/components/landing/FaqSection";
import FinalCta from "@/components/landing/FinalCta";
import LandingFooter from "@/components/landing/LandingFooter";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <LandingNav />
      <main>
        <Hero />
        <FeaturesGrid />
        <ProductDemo />
        <PlatformDark />
        <HardwareSection />
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
