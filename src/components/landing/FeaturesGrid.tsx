import GeoIcon from "./GeoIcon";
import SectionHeading from "./SectionHeading";
import { painPoints, quickFeatures } from "./content";

export default function FeaturesGrid() {
  return (
    <section id="features" aria-label="Fonctionnalités" className="border-b-2 border-line bg-paper py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading
          index="01"
          title="Arrêtez de jongler. Faites grandir votre réseau."
          marker="grandir"
        />

        {/* Trois promesses — bande éditoriale */}
        <ul role="list" className="mb-14 grid grid-cols-1 border-2 border-line sm:grid-cols-3">
          {painPoints.map((item, i) => (
            <li
              key={item.fix}
              className={`p-5 ${i > 0 ? "border-t-2 border-line sm:border-l-2 sm:border-t-0" : ""}`}
            >
              <p className="font-display text-sm font-bold uppercase tracking-wide text-brand-deep">
                {item.fix}
              </p>
              <p className="mt-2 text-sm leading-6 text-ink-soft">{item.pain}</p>
            </li>
          ))}
        </ul>

        {/* Grille asymétrique 12 colonnes */}
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-12">
          {quickFeatures.map((f) => (
            <article
              key={f.title}
              className={`group border-2 border-line p-6 transition-colors sm:p-7 ${f.span} ${
                f.featured ? "bg-brand" : "bg-paper hover:bg-clay"
              }`}
            >
              <div
                aria-hidden="true"
                className={f.featured ? "text-[#1C1917]" : "text-ink"}
              >
                <GeoIcon
                  name={f.icon}
                  className="h-9 w-9"
                  accent={f.featured ? "#1C1917" : "#EAB308"}
                />
              </div>
              <h3
                className={`mt-4 font-display text-xl font-bold ${
                  f.featured ? "text-[#1C1917]" : "text-ink"
                }`}
              >
                {f.title}
              </h3>
              <p
                className={`mt-2 max-w-xl text-sm leading-6 ${
                  f.featured ? "text-[#44403C]" : "text-ink-soft"
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
