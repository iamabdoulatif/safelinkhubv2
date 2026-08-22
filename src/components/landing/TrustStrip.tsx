import { Zap, Wallet, Radar } from "lucide-react";
import { painPoints } from "./content";
import type { Dictionary } from "@/lib/i18n/fr";

/* Bande de trois promesses juste sous le hero — le motif d'assurance de Slate.
 *
 * La STRUCTURE vient de `painPoints` (content.ts), le TEXTE du dictionnaire, et
 * les deux sont appariés par index. Un test vérifie que les longueurs
 * concordent : un décalage collerait la mauvaise icône à la bonne promesse. */
const icons = [Zap, Wallet, Radar];

export default function TrustStrip({ dict }: { dict: Dictionary }) {
  return (
    <section aria-label={dict.trust.heading} className="border-b border-line bg-paper">
      <div className="stagger mx-auto grid max-w-6xl grid-cols-1 gap-px bg-line sm:grid-cols-3">
        {painPoints.map((_, i) => {
          const Icon = icons[i] ?? Zap;
          const item = dict.content.painPoints[i];
          return (
            <div key={item.fix} className="reveal tile-hover flex gap-4 bg-paper px-6 py-8 sm:px-7">
              <span
                aria-hidden="true"
                className="tile-hover-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand text-slate-deep"
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
