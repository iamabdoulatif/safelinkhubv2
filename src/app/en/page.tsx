import type { Metadata } from "next";
import LandingPage from "@/components/landing/LandingPage";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { getPlatformStats } from "@/lib/landing/platform-stats";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "SafeLinkHub | Hotspot billing & ISP automation",
  description:
    "Mobile money billing, MikroTik provisioning and real-time monitoring, from a single dashboard.",
  alternates: {
    canonical: "/en",
    languages: { fr: "/", en: "/en" },
  },
};

/* Version ANGLAISE. Deux pages statiques plutôt qu'une page dynamique lisant un
 * cookie : la landing reste prérendue et mise en cache au bord par Cloudflare,
 * dans les deux langues. */
export default async function HomeEn() {
  const [dict, stats] = await Promise.all([
    getDictionary("en"),
    getPlatformStats(),
  ]);
  return <LandingPage dict={dict} locale="en" stats={stats} />;
}
