import GeoIcon from "./GeoIcon";
import SectionIntro from "./SectionIntro";
import { platformFeatures } from "./content";
import type { Dictionary } from "@/lib/i18n/fr";

/* Bande vert profond — la respiration sombre de Slate au milieu de la page.
 * Elle reprend le vert des bandeaux (--slate-deep) plutôt que l'anthracite
 * Bitume, pour rester dans la même famille que le pied de page. */
export default function PlatformDark({ dict }: { dict: Dictionary }) {
  return (
    <section
      id="plateforme"
      aria-label={dict.platform.aria}
      className="border-b border-line bg-slate-deep py-16 sm:py-24"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionIntro
          eyebrow={dict.platform.eyebrow}
          title={dict.platform.title}
          marker={dict.platform.mark}
          lead={dict.platform.lead}
          dark
        />
        <div className="stagger mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {platformFeatures.map((f, i) => {
            const t = dict.content.platformFeatures[i];
            return (
            <article
              key={t.title}
              className="reveal rounded-2xl border border-slate-deep-line bg-[#0E2618] p-6 sm:p-7"
            >
              <div aria-hidden="true" className="text-white">
                <GeoIcon name={f.icon} className="h-8 w-8" accent="#C8F24E" />
              </div>
              <h3 className="mt-4 font-display text-lg font-bold text-white">{t.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-deep-soft">{t.description}</p>
            </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
