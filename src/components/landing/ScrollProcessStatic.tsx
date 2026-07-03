import { processSteps } from "./content";

/** Version statique de la section "Comment ça marche" — servie au SSR,
 * pendant le chargement du chunk 3D, et quand l'environnement ne permet
 * pas d'animer (prefers-reduced-motion, WebGL absent). */
export default function ScrollProcessStatic() {
  return (
    <section aria-label="Comment ça marche" className="border-b-2 border-line bg-paper">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <p className="font-mono text-xs font-medium uppercase tracking-widest text-ink-soft">
          Comment ça marche
        </p>
        <ol className="mt-6 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {processSteps.map((step, i) => (
            <li key={step.title} className="border-l-2 border-brand pl-4">
              <span className="font-display text-xs font-extrabold text-ink-soft">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-2 font-display text-xl font-bold text-ink">{step.title}</h3>
              <p className="mt-2 text-sm leading-6 text-ink-soft">{step.description}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
