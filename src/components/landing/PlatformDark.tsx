import GeoIcon from "./GeoIcon";
import SectionHeading from "./SectionHeading";
import { platformFeatures } from "./content";

export default function PlatformDark() {
  return (
    <section
      id="plateforme"
      aria-label="Plateforme complète"
      className="border-b-2 border-line bg-ink py-16 sm:py-24"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading
          index="03"
          title="Une plateforme complète pour un contrôle total."
          marker="contrôle total"
          dark
        />
        {/* Grille à séparateurs pleins : le fond du conteneur fait les traits */}
        <div className="grid grid-cols-1 gap-[2px] border-2 border-[#3A362F] bg-[#3A362F] sm:grid-cols-2 lg:grid-cols-3">
          {platformFeatures.map((f) => (
            <article key={f.title} className="bg-ink p-6 text-paper sm:p-7">
              <div aria-hidden="true" className="text-paper">
                <GeoIcon name={f.icon} className="h-8 w-8" />
              </div>
              <h3 className="mt-4 font-display text-lg font-bold">{f.title}</h3>
              <p className="mt-2 text-sm leading-6 text-[#A8A29E]">{f.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
