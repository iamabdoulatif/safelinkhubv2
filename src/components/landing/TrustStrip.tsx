import { Zap, Wallet, Radar } from "lucide-react";
import { painPoints } from "./content";

/* Bande de trois promesses juste sous le hero — le motif d'assurance de Slate.
 * Le texte vient de `painPoints` (déjà rédigé), pas d'une nouvelle copie à
 * maintenir en double. */
const icons = [Zap, Wallet, Radar];

export default function TrustStrip() {
  return (
    <section aria-label="Ce que SafeLinkHub supprime" className="border-b border-line bg-paper">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-px bg-line sm:grid-cols-3">
        {painPoints.map((item, i) => {
          const Icon = icons[i] ?? Zap;
          return (
            <div key={item.fix} className="flex gap-4 bg-paper px-6 py-8 sm:px-7">
              <span
                aria-hidden="true"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand text-slate-deep"
              >
                <Icon className="h-5 w-5" />
              </span>
              <div>
                <p className="font-display text-base font-bold text-ink">{item.fix}</p>
                <p className="mt-1.5 text-sm leading-6 text-ink-soft">{item.pain}</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
