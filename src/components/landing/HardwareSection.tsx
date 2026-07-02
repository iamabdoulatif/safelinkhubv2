import GeoIcon from "./GeoIcon";
import SectionHeading from "./SectionHeading";
import { hardware } from "./content";

export default function HardwareSection() {
  return (
    <section
      id="materiel"
      aria-label="Compatibilité matérielle"
      className="border-b-2 border-line bg-paper py-16 sm:py-24"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading index="04" title="Une seule plateforme. Tout votre matériel." marker="Tout" />
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {hardware.map((h, i) => (
            <article
              key={h.name}
              className={`flex gap-5 border-2 border-line p-6 sm:p-7 ${
                i === 0 ? "bg-clay" : "bg-paper hover:bg-clay"
              }`}
            >
              <div aria-hidden="true" className="shrink-0 text-ink">
                <GeoIcon name={h.icon} className="h-10 w-10" />
              </div>
              <div>
                <h3 className="font-display text-xl font-bold text-ink" translate="no">
                  {h.name}
                  {i === 0 && (
                    <span className="ml-3 align-middle font-mono text-[10px] font-semibold uppercase tracking-widest text-brand-deep">
                      Intégration native
                    </span>
                  )}
                </h3>
                <p className="mt-2 text-sm leading-6 text-ink-soft">{h.description}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
