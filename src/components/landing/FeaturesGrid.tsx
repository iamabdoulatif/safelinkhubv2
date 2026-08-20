import GeoIcon from "./GeoIcon";
import SectionIntro from "./SectionIntro";
import { quickFeatures } from "./content";

/* Grille de fonctionnalités, motif Slate : cartes arrondies à trait fin, une
 * carte mise en avant en aplat lime. La grille asymétrique 12 colonnes de la
 * version Bitume est conservée — c'est elle qui donne son rythme à la section. */
export default function FeaturesGrid() {
  return (
    <section id="features" aria-label="Fonctionnalités" className="border-b border-line bg-paper py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionIntro
          eyebrow="Fonctionnalités"
          title="Arrêtez de jongler. Faites grandir votre réseau."
          marker="grandir"
          lead="Tout ce qu'un opérateur hotspot fait à la main, la plateforme le fait à sa place — et le facture."
        />

        <div className="stagger mt-12 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-12">
          {quickFeatures.map((f) => (
            <article
              key={f.title}
              className={`reveal slate-card p-6 sm:p-7 ${f.span} ${
                f.featured ? "border-transparent bg-brand" : "bg-paper hover:bg-clay"
              }`}
            >
              <div aria-hidden="true" className={f.featured ? "text-slate-deep" : "text-ink"}>
                <GeoIcon
                  name={f.icon}
                  className="h-9 w-9"
                  accent={f.featured ? "#12301D" : "#3F6212"}
                />
              </div>
              <h3
                className={`mt-4 font-display text-xl font-bold ${
                  f.featured ? "text-slate-deep" : "text-ink"
                }`}
              >
                {f.title}
              </h3>
              <p
                className={`mt-2 max-w-xl text-sm leading-6 ${
                  f.featured ? "text-[#2C4A34]" : "text-ink-soft"
                }`}
              >
                {f.description}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
