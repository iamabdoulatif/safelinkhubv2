import { TrendingUp } from "lucide-react";
import SectionHeading from "./SectionHeading";
import { mockStats } from "./content";

/*
 * Section démo : mock du dashboard dans un cadre éditorial +
 * emplacement vidéo pour un futur rendu 3D (déposer le fichier dans
 * public/landing/demo-3d.mp4 — le poster SVG s'affiche en attendant).
 */
export default function ProductDemo() {
  return (
    <section id="demo" aria-label="Démonstration produit" className="border-b-2 border-line bg-clay py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading index="02" title="Le tableau de bord qui pilote tout." marker="tout" />

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          {/* Mock dashboard encadré */}
          <div className="frame-double bg-paper lg:col-span-7">
            {/* Barre de navigateur */}
            <div className="flex items-center gap-2 border-b-2 border-line bg-ink px-4 py-3">
              <span aria-hidden="true" className="h-2.5 w-2.5 bg-err" />
              <span aria-hidden="true" className="h-2.5 w-2.5 bg-brand" />
              <span aria-hidden="true" className="h-2.5 w-2.5 bg-ok" />
              <span className="ml-3 truncate font-mono text-xs text-clay">
                app.safelinkhub.net/admin
              </span>
            </div>
            {/* KPI */}
            <div className="grid grid-cols-1 sm:grid-cols-3">
              {mockStats.map((s, i) => (
                <div
                  key={s.label}
                  className={`p-5 ${i > 0 ? "border-t-2 border-line sm:border-l-2 sm:border-t-0" : ""}`}
                >
                  <p className="font-mono text-[11px] font-semibold uppercase tracking-widest text-ink-soft">
                    {s.label}
                  </p>
                  <p className="mt-2 whitespace-nowrap font-mono text-lg font-bold tabular-nums text-ink sm:text-xl">
                    {s.value}
                  </p>
                  <p className="mt-1 flex items-center gap-1 font-mono text-xs font-medium text-ok">
                    <TrendingUp aria-hidden="true" className="h-3 w-3" />
                    {s.trend} ce mois
                  </p>
                </div>
              ))}
            </div>
            {/* Barre de statut routeurs */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t-2 border-line bg-ink px-4 py-2.5">
              <span className="flex items-center gap-1.5 font-mono text-xs text-clay">
                <span aria-hidden="true" className="iso-led h-1.5 w-1.5 bg-brand" />
                12 routeurs en ligne
              </span>
              <span className="font-mono text-xs text-clay">847 connexions actives</span>
            </div>
          </div>

          {/* Emplacement vidéo 3D */}
          <figure className="lg:col-span-5">
            <div className="border-2 border-line bg-ink">
              <video
                className="aspect-video w-full object-cover"
                controls
                preload="none"
                poster="/landing/demo-poster.svg"
              >
                <source src="/landing/demo-3d.mp4" type="video/mp4" />
                Votre navigateur ne prend pas en charge la vidéo.
              </video>
            </div>
            <figcaption className="mt-3 flex items-baseline justify-between gap-4">
              <span className="text-sm font-semibold text-ink">
                SafeLinkHub × MikroTik en 60 secondes
              </span>
              <span className="font-mono text-[11px] uppercase tracking-widest text-ink-soft">
                Vidéo
              </span>
            </figcaption>
          </figure>
        </div>
      </div>
    </section>
  );
}
