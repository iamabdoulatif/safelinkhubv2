import type { Metadata } from "next";
import { TrainingPageContent } from "../../formations/page";

/* ISR plutôt que statique : cette page liste des ARTICLES et des PARCOURS,
 * qui changent sans redéploiement. Figée au build, elle servait encore les
 * anciennes couvertures alors que la base avait été mise à jour — et la
 * construction de la CI lit une base distincte de celle de production, ce qui
 * gèle aussi les compteurs par thème sur un état qui n'est pas le vôtre.
 * Cinq minutes : assez pour que publier un article se voie, assez peu pour ne
 * pas rendre la page dynamique à chaque visite. */
export const revalidate = 300;

export const metadata: Metadata = {
  title: "Training | SafeLinkHub",
  description:
    "Paths and guides to install, secure and monetise a MikroTik Wi-Fi hotspot.",
  alternates: { canonical: "/en/formations", languages: { fr: "/formations", en: "/en/formations" } },
};

export default function TrainingPageEn() {
  return <TrainingPageContent locale="en" />;
}
