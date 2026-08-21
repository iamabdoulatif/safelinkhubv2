import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Dictionary } from "@/lib/i18n/fr";

/* Le « split éditorial » de Slate : gros titre à gauche, paragraphe et lien
 * à droite. Sert de respiration entre le hero et les sections denses. */
export default function IntroSplit({ dict }: { dict: Dictionary }) {
  // Le titre porte un retour à la ligne voulu ; on le rend explicitement plutôt
  // que de laisser un \n dans du JSX, où il serait avalé.
  const lignes = dict.intro.title.split("\n");
  return (
    <section aria-label={dict.intro.link} className="border-b border-line bg-paper py-16 sm:py-24">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-4 sm:px-6 lg:grid-cols-12 lg:gap-16">
        <h2 className="font-display text-3xl font-bold leading-[1.15] tracking-tight text-ink sm:text-4xl lg:col-span-6 md:text-[2.75rem]">
          {lignes.map((ligne, i) => (
            <span key={ligne}>
              {ligne}
              {i < lignes.length - 1 ? <br /> : null}
            </span>
          ))}
        </h2>
        <div className="lg:col-span-6 lg:pt-3">
          <p className="text-base leading-7 text-ink-soft">{dict.intro.body}</p>
          <Link
            href="#demo"
            className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-brand-deep underline-offset-4 hover:underline"
          >
            {dict.intro.link}
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
