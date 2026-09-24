import Link from "next/link";
import { ArrowRight, Radar, Terminal, Wallet, Zap } from "lucide-react";
import { painPoints } from "./content";
import type { Dictionary } from "@/lib/i18n/fr";

/* Grille « bento » sous le hero : la promesse éditoriale (un script à coller)
 * en grande tuile sombre, puis les trois irritants que la plateforme supprime.
 * Remplace l'ancienne bande de trois promesses + le split éditorial, qui
 * disaient la même chose en deux sections.
 *
 * La STRUCTURE vient de `painPoints` (content.ts), le TEXTE du dictionnaire, et
 * les deux sont appariés par index. Un test vérifie que les longueurs
 * concordent : un décalage collerait la mauvaise icône à la bonne promesse. */
const icons = [Zap, Wallet, Radar];

export default function TrustStrip({ dict }: { dict: Dictionary }) {
  // Le titre porte un retour à la ligne voulu ; rendu explicitement plutôt
  // qu'un \n dans du JSX, où il serait avalé.
  const lignes = dict.intro.title.split("\n");
  return (
    <section aria-label={dict.trust.heading} className="border-b border-line bg-clay py-16 sm:py-24">
      <div className="stagger mx-auto grid max-w-6xl grid-cols-1 gap-4 px-4 sm:px-6 lg:grid-cols-3 lg:grid-rows-3">
        <div className="reveal flex flex-col justify-between rounded-3xl bg-slate-deep p-7 sm:p-10 lg:col-span-2 lg:row-span-3">
          <div>
            <span
              aria-hidden="true"
              className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand text-slate-deep"
            >
              <Terminal className="h-5 w-5" />
            </span>
            <h2 className="mt-8 font-display text-3xl font-bold leading-[1.12] tracking-tight text-white sm:text-4xl md:text-[2.75rem]">
              {lignes.map((ligne, i) => (
                <span key={ligne}>
                  {ligne}
                  {i < lignes.length - 1 ? <br /> : null}
                </span>
              ))}
            </h2>
            <p className="mt-5 max-w-xl text-base leading-7 text-slate-deep-soft">{dict.intro.body}</p>
          </div>
          <Link
            href="#demo"
            className="mt-8 inline-flex w-fit items-center gap-2 text-sm font-semibold text-brand underline-offset-4 hover:underline"
          >
            {dict.intro.link}
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        </div>

        {painPoints.map((_, i) => {
          const Icon = icons[i] ?? Zap;
          const item = dict.content.painPoints[i];
          return (
            <div key={item.fix} className="reveal tile-hover flex gap-4 rounded-3xl border border-line bg-paper p-6">
              <span
                aria-hidden="true"
                className="tile-hover-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand text-slate-deep"
              >
                <Icon className="h-5 w-5" />
              </span>
              <div>
                <h3 className="font-display text-base font-bold text-ink">{item.fix}</h3>
                <p className="mt-1.5 text-sm leading-6 text-ink-soft">{item.pain}</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
