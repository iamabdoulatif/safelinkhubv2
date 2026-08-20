import SectionIntro from "./SectionIntro";
import { processSteps } from "./content";

/** Section « Comment ça marche » — quatre étapes, sans animation.
 *
 * Anciennement la version de repli d'une scène three.js pilotée au scroll
 * (ScrollProcess). La scène a été supprimée avec le reste des animations ;
 * ce qui n'était qu'un filet de sécurité devient la section elle-même. */
export default function ProcessSteps() {
  return (
    <section aria-label="Comment ça marche" className="border-b border-line bg-paper py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionIntro
          eyebrow="Comment ça marche"
          title="Du carton au premier encaissement."
          marker="premier encaissement"
        />
        <ol className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {processSteps.map((step, i) => (
            <li key={step.title} className="slate-card bg-paper p-6">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand font-mono text-xs font-bold text-slate-deep">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-4 font-display text-lg font-bold text-ink">{step.title}</h3>
              <p className="mt-2 text-sm leading-6 text-ink-soft">{step.description}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
