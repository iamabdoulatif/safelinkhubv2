import type { Metadata } from "next";
import LandingPage from "@/components/landing/LandingPage";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { getPlatformStats } from "@/lib/landing/platform-stats";

// ISR : la landing est majoritairement statique, mais les témoignages
// approuvés et les derniers articles viennent de la base. On revalide
// périodiquement (et à chaud via revalidatePath("/") lors de la modération).
export const revalidate = 300;

export const metadata: Metadata = {
  title: "SafeLinkHub | Facturation hotspot & automatisation FAI",
  description:
    "Facturation mobile money, provisionnement MikroTik et supervision temps réel, depuis un seul tableau de bord.",
  alternates: {
    canonical: "/",
    // Indique aux moteurs que les deux versions sont la même page en deux
    // langues, et non du contenu dupliqué.
    languages: { fr: "/", en: "/en" },
  },
};

/* Version FRANÇAISE, servie à la racine : aucune URL existante ne bouge.
 * La composition vit dans LandingPage, partagée avec /en — ajouter une section
 * ici seulement la ferait disparaître en silence de la version anglaise. */
export default async function Home() {
  const [dict, stats] = await Promise.all([
    getDictionary("fr"),
    getPlatformStats(),
  ]);
  return <LandingPage dict={dict} locale="fr" stats={stats} />;
}
